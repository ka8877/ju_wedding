import { createClient } from '@supabase/supabase-js';
import { defaultWedding } from './defaults';
import type { StoredWedding, WeddingData } from './types';
import { normalizeWedding, publicationErrors, sameWeddingContent } from './validation';
import { publicSupabaseConfig } from './public-config';

const url = (import.meta.env.VITE_SUPABASE_URL || publicSupabaseConfig.url) as string;
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY || publicSupabaseConfig.key) as string;
export const cloudConfigured = import.meta.env.VITE_LOCAL_PREVIEW !== 'true' && Boolean(url && key);
export const supabase = cloudConfigured ? createClient(url!, key!) : null;
// Reads must match a guest's view even when this browser is signed in as an administrator.
const publicReader = cloudConfigured ? createClient(url, key, { auth: { storageKey: 'wedding-public-read-only', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) : null;

function openLocal(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('jo-and-joo', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('wedding');
    r.onerror = () => reject(new Error('이 브라우저에서 저장 공간을 열지 못했습니다. 일반 브라우저 창에서 다시 시도해 주세요.'));
    r.onsuccess = () => resolve(r.result);
  });
}
async function localRead(key: string): Promise<StoredWedding | undefined> {
  const db = await openLocal();
  try {
    return await new Promise((resolve, reject) => {
      const r = db.transaction('wedding').objectStore('wedding').get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(new Error('저장된 내용을 읽지 못했습니다.'));
    });
  } finally { db.close(); }
}
async function localWrite(key: string, value: StoredWedding) {
  const db = await openLocal();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('wedding', 'readwrite');
      tx.objectStore('wedding').put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error('저장 공간이 부족합니다. 사진 수를 줄인 뒤 다시 저장해 주세요.'));
      tx.onabort = () => reject(new Error('저장하지 못했습니다. 브라우저의 저장 공간을 확인해 주세요.'));
    });
  } finally { db.close(); }
}
const initial = (): StoredWedding => ({ data: structuredClone(defaultWedding), updatedAt: null });
function notifyPublication() {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel('jo-and-joo'); channel.postMessage('published'); channel.close();
}
function checked(data: unknown): WeddingData {
  return normalizeWedding(data);
}
export async function loadPublic(requirePublished = false): Promise<StoredWedding> {
  if (!supabase) {
    const value = await localRead('published');
    return value ? { ...value, data: checked(value.data) } : initial();
  }
  const { data, error } = await publicReader!.rpc('get_published_wedding');
  // A newly created project has no wedding schema yet. Keep an explicitly
  // unpublished invitation available; this never enables browser-local editing.
  if (error?.code === 'PGRST202' && !requirePublished) return initial();
  if (error?.code === 'PGRST202') throw new Error('작성한 내용은 저장했지만 공개 반영 여부를 확인하지 못했어요. 잠시 후 청첩장을 다시 확인해 주세요.');
  if (error) throw new Error('청첩장을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
  if (!data?.length && requirePublished) throw new Error('저장한 청첩장을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
  if (!data?.length) return initial();
  return { data: checked(data[0].data), updatedAt: data[0].updated_at };
}
export async function requireAdmin(): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase.rpc('is_wedding_admin');
  if (error?.code === 'PGRST202') throw new Error('지금은 편집 화면을 열 수 없어요. 잠시 후 다시 시도해 주세요.');
  if (error || data !== true) throw new Error('이 계정에는 관리 권한이 없습니다. 초대받은 관리자 계정으로 로그인해 주세요.');
}
export async function loadBrowserDraft(): Promise<StoredWedding | null> {
  const value = await localRead('draft');
  return value ? { ...value, data: checked(value.data) } : null;
}
export async function loadDraft(): Promise<StoredWedding> {
  if (!supabase) {
    return (await loadBrowserDraft()) ?? initial();
  }
  await requireAdmin();
  const { data, error } = await supabase.from('wedding_content').select('draft,updated_at').eq('id', 'main').maybeSingle();
  if (error) throw new Error('초안을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
  return data ? { data: checked(data.draft), updatedAt: data.updated_at } : initial();
}
export async function saveDraft(data: WeddingData): Promise<string> {
  const content = checked(data);
  const now = new Date().toISOString();
  if (!supabase) await localWrite('draft', { data: content, updatedAt: now });
  else {
    const { data: row, error } = await supabase.from('wedding_content').upsert({ id: 'main', draft: content, updated_at: now }, { onConflict: 'id' }).select('updated_at').single();
    if (error || !row || typeof row.updated_at !== 'string' || !Number.isFinite(Date.parse(row.updated_at))) throw new Error('저장 결과를 확인하지 못했습니다. 로그인 상태와 연결을 확인하고 다시 시도해 주세요.');
    return row.updated_at;
  }
  return now;
}
export async function publishWedding(data: WeddingData): Promise<string> {
  const content = checked(data);
  const problems = publicationErrors(content);
  if (problems.length) throw new Error(problems.join('\n'));
  const now = new Date().toISOString();
  if (!supabase) {
    await localWrite('draft', { data: content, updatedAt: now });
    await localWrite('published', { data: content, updatedAt: now });
    notifyPublication();
  } else {
    const { data: row, error } = await supabase.from('wedding_content').upsert({ id: 'main', draft: content, published: content, updated_at: now }, { onConflict: 'id' }).select('updated_at').single();
    if (error || !row || typeof row.updated_at !== 'string' || !Number.isFinite(Date.parse(row.updated_at))) throw new Error('공개 저장 결과를 확인하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.');
    const published = await loadPublic(true);
    if (!sameWeddingContent(published.data, content)) throw new Error('저장은 요청했지만 하객용 청첩장 내용이 일치하지 않습니다. 다른 관리자가 동시에 수정했을 수 있으니 새 창의 청첩장을 확인해 주세요.');
    notifyPublication();
    return published.updatedAt ?? now;
  }
  return now;
}

export async function preparePhoto(file: File): Promise<Blob> {
  if (!['image/jpeg','image/png','image/webp','image/avif'].includes(file.type)) throw new Error('JPG, PNG, WebP, AVIF 사진을 선택해 주세요. 아이폰 HEIC 사진은 JPG로 변환해 주세요.');
  if (file.size > 8 * 1024 * 1024) throw new Error('사진은 한 장에 8MB 이하로 선택해 주세요.');
  if (file.size === 0) throw new Error('비어 있는 사진입니다. 다른 사진을 선택해 주세요.');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { throw new Error('사진을 읽을 수 없습니다. 다른 JPG 또는 PNG 파일로 시도해 주세요.'); }
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) { bitmap.close(); throw new Error('사진 변환을 지원하지 않는 브라우저입니다.'); }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('사진을 변환하지 못했습니다.')), 'image/webp', 0.86));
}
export async function uploadPhoto(file: File): Promise<string> {
  const photo = await preparePhoto(file);
  if (!supabase) return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('사진을 읽지 못했습니다.'));
    reader.readAsDataURL(photo);
  });
  const extension = photo.type === 'image/webp' ? 'webp' : 'png';
  const path = `main/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from('wedding-photos').upload(path, photo, { contentType: photo.type, cacheControl: '31536000', upsert: false });
  if (error) throw new Error('사진을 올리지 못했어요. 잠시 후 다시 시도해 주세요.');
  return supabase.storage.from('wedding-photos').getPublicUrl(path).data.publicUrl;
}
