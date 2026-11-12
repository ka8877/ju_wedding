import { createClient } from '@supabase/supabase-js';
import { cloudConfigured, preparePhoto, requireAdmin, supabase } from './storage';
import { publicSupabaseConfig } from './public-config';
import type { GuestCapabilities, GuestPhotoReceipt, GuestPhotoRecord, RsvpInput, RsvpReceipt, RsvpRecord } from './guest-types';
export type { GuestCapabilities, GuestPhotoReceipt, GuestPhotoRecord, RsvpInput, RsvpReceipt, RsvpRecord } from './guest-types';

const projectUrl = import.meta.env.VITE_SUPABASE_URL || publicSupabaseConfig.url;
const publicKey = import.meta.env.VITE_SUPABASE_ANON_KEY || publicSupabaseConfig.key;
const guestClient = cloudConfigured ? createClient(projectUrl, publicKey, {
  auth: { storageKey: 'wedding-guest-submissions', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(20_000) }) },
}) : null;
const setupMessage = '하객 자료를 불러오지 못했어요. 잠시 후 새로고침해 주세요.';
const guestPendingMessage = '아직 접수를 준비하고 있어요. 잠시 후 다시 확인하거나 신랑·신부에게 연락해 주세요.';
const localMessage = '미리보기에서는 실제 응답이나 현장 사진을 접수하지 않아요. 공개 청첩장에서 이용해 주세요.';
const missingSchema = (error: { code?: string } | null) => Boolean(error && ['PGRST202', '42883', '42P01', '42501'].includes(error.code || ''));
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let memoryToken: string | undefined;

function clientToken(): string {
  try {
    const existing = sessionStorage.getItem('wedding-guest-client');
    if (existing && uuidPattern.test(existing)) return existing;
    const token = crypto.randomUUID(); sessionStorage.setItem('wedding-guest-client', token); return token;
  } catch { return memoryToken ??= crypto.randomUUID(); }
}

export async function getGuestCapabilities(): Promise<GuestCapabilities> {
  const unavailable = (status: GuestCapabilities['status'], message: string): GuestCapabilities => ({ status, rsvpEnabled: false, snapEnabled: false, snapOpen: false, snapOpenDate: '', message });
  if (!guestClient) return unavailable('local', localMessage);
  try {
    const { data, error } = await guestClient.rpc('get_wedding_guest_capabilities');
    if (error) return unavailable(missingSchema(error) ? 'setup-required' : 'offline', missingSchema(error) ? guestPendingMessage : '접수 연결을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
    if (!data || typeof data.rsvp_enabled !== 'boolean' || typeof data.snap_enabled !== 'boolean' || typeof data.snap_open !== 'boolean' || !/^\d{4}-\d{2}-\d{2}$/.test(data.snap_open_date)) {
      return unavailable('setup-required', guestPendingMessage);
    }
    return { status: 'ready', rsvpEnabled: data.rsvp_enabled, snapEnabled: data.snap_enabled, snapOpen: data.snap_open, snapOpenDate: data.snap_open_date, message: '' };
  } catch { return unavailable('offline', '접수 연결을 확인하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.'); }
}

/** Shared client validation; SQL applies the same rules independently. */
export function validateRsvpInput(input: RsvpInput): RsvpInput {
  if (!input || !['groom', 'bride'].includes(input.side) || typeof input.attending !== 'boolean') throw new Error('신랑측 또는 신부측과 참석 여부를 선택해 주세요.');
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 80) throw new Error('성함을 80자 이내로 입력해 주세요.');
  if (typeof input.phone !== 'string') throw new Error('연락처를 확인해 주세요.');
  const phone = input.phone.trim();
  if (phone && (phone.length > 30 || !/^[0-9+() -]+$/.test(phone) || !/^\d{7,15}$/.test(phone.replace(/\D/g, '')))) throw new Error('연락처는 숫자와 +, -, 괄호로 입력해 주세요.');
  if (input.consent !== true) throw new Error('응답 전달을 위한 개인정보 수집 안내에 동의해 주세요.');
  if (!Number.isInteger(input.guests) || (input.attending && (input.guests < 1 || input.guests > 10))) throw new Error('본인을 포함한 참석 인원을 1~10명으로 선택해 주세요.');
  if (!['yes', 'no', 'undecided'].includes(input.meal) || !['none', 'daejeon', 'gyeongju'].includes(input.shuttle)) throw new Error('식사와 대절버스 이용 여부를 확인해 주세요.');
  if (typeof input.message !== 'string' || input.message.trim().length > 1000) throw new Error('전하실 말은 1,000자 이내로 입력해 주세요.');
  return { ...input, name: input.name.trim(), phone, message: input.message.trim(), guests: input.attending ? input.guests : 0,
    meal: input.attending ? input.meal : 'no', shuttle: input.attending ? input.shuttle : 'none' };
}

export async function submitRsvp(input: RsvpInput, requestToken?: string): Promise<RsvpReceipt> {
  const payload = validateRsvpInput(input);
  if (requestToken !== undefined && (typeof requestToken !== 'string' || !uuidPattern.test(requestToken))) throw new Error('응답 접수 정보를 확인하지 못했어요. 창을 닫고 다시 열어 주세요.');
  if (!guestClient) throw new Error(localMessage);
  const { data, error } = await guestClient.rpc('submit_wedding_rsvp', { p_payload: payload, p_client_token: requestToken ?? clientToken() });
  if (error) throw new Error(missingSchema(error) ? guestPendingMessage : error.code === 'P0001' ? '지금은 참석 응답을 접수할 수 없어요. 신랑·신부에게 직접 연락해 주세요.' : '응답을 전달하지 못했어요. 네트워크를 확인한 뒤 다시 시도해 주세요.');
  if (!data || typeof data.id !== 'string' || typeof data.created_at !== 'string' || !Number.isFinite(Date.parse(data.created_at))) throw new Error('접수 결과를 확인하지 못했어요. 다시 전달하거나 신랑·신부에게 문의해 주세요.');
  return { id: data.id, createdAt: data.created_at };
}

export async function listRsvps(): Promise<RsvpRecord[]> {
  if (!supabase) throw new Error(localMessage);
  await requireAdmin();
  const { data, error } = await supabase.from('wedding_rsvps').select('id,side,attending,name,phone,guests,meal,shuttle,message,created_at').order('created_at', { ascending: false }).limit(5000);
  if (error) throw new Error(missingSchema(error) ? setupMessage : '참석 응답을 불러오지 못했어요. 로그인 상태와 연결을 확인해 주세요.');
  return (data ?? []).map(row => ({ id: row.id, side: row.side, attending: row.attending, name: row.name, phone: row.phone,
    guests: row.guests, meal: row.meal, shuttle: row.shuttle, message: row.message, createdAt: row.created_at })) as RsvpRecord[];
}

export async function uploadGuestPhoto(file: File, guestName: string): Promise<GuestPhotoReceipt> {
  if (!guestClient) throw new Error(localMessage);
  if (typeof guestName !== 'string' || guestName.trim().length > 80) throw new Error('성함은 80자 이내로 입력해 주세요.');
  const photo = await preparePhoto(file);
  if (photo.size > 2 * 1024 * 1024) throw new Error('변환한 사진은 2MB까지 올릴 수 있어요. 더 작은 사진을 선택해 주세요.');
  const fileName = file.name.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 120).trim() || 'wedding-photo.webp';
  const { data, error } = await guestClient.rpc('reserve_wedding_guest_photo', {
    p_client_token: clientToken(), p_guest_name: guestName.trim(), p_file_name: fileName,
    p_content_type: photo.type, p_byte_size: photo.size,
  });
  if (error) throw new Error(missingSchema(error) ? guestPendingMessage : error.code === 'P0001' ? '아직 현장 사진을 받을 수 없거나 이번 업로드 한도에 도달했어요. 예식일에 확인하거나 한 시간 뒤 다시 시도해 주세요.' : '사진 접수 연결을 준비하지 못했어요. 다시 시도해 주세요.');
  if (!data || typeof data.id !== 'string' || typeof data.storage_path !== 'string' || typeof data.created_at !== 'string') throw new Error('사진 저장 경로를 확인하지 못했어요. 다시 시도해 주세요.');
  const upload = await guestClient.storage.from('wedding-guest-photos').upload(data.storage_path, photo, { contentType: photo.type, upsert: false, cacheControl: '3600' });
  if (upload.error) throw new Error('사진을 저장하지 못했어요. 접수 가능 시간과 네트워크를 확인해 주세요. 전송 중인 다른 사진이 있다면 완료 후 다시 시도해 주세요.');
  return { id: data.id, fileName, createdAt: data.created_at };
}

export async function listGuestPhotos(): Promise<GuestPhotoRecord[]> {
  if (!supabase) throw new Error(localMessage);
  await requireAdmin();
  const { data, error } = await supabase.rpc('list_wedding_guest_photos');
  if (error) throw new Error(missingSchema(error) ? setupMessage : '현장 사진 목록을 불러오지 못했어요. 로그인 상태와 연결을 확인해 주세요.');
  if (!Array.isArray(data)) throw new Error('현장 사진 목록을 확인하지 못했어요. 잠시 후 새로고침해 주세요.');
  if (!data.length) return [];
  const { data: links, error: linkError } = await supabase.storage.from('wedding-guest-photos').createSignedUrls(data.map(row => row.storage_path), 3600, { download: true });
  if (linkError) throw new Error('사진을 열 수 없어요. 잠시 후 새로고침해 주세요.');
  const byPath = new Map((links ?? []).map(link => [link.path, link.signedUrl]));
  return data.map(row => ({ id: row.id, guestName: row.guest_name, fileName: row.file_name, storagePath: row.storage_path,
    createdAt: row.created_at, downloadUrl: byPath.get(row.storage_path) || null }));
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  const safe = /^[=+\-@]/.test(text.trimStart()) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function rsvpsToCsv(records: RsvpRecord[]): string {
  const rows: unknown[][] = [['접수일시(한국)', '구분', '성함', '연락처', '참석 여부', '본인 포함 인원', '식사', '대절버스', '전하실 말']];
  for (const record of records) rows.push([
    new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(record.createdAt)),
    record.side === 'groom' ? '신랑측' : '신부측', record.name, record.phone, record.attending ? '참석' : '불참', record.guests,
    { yes: '예', no: '아니요', undecided: '미정' }[record.meal], { none: '이용 안 함', daejeon: '대전', gyeongju: '경주' }[record.shuttle], record.message,
  ]);
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function downloadRsvpsCsv(records: RsvpRecord[]): void {
  const url = URL.createObjectURL(new Blob([rsvpsToCsv(records)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url;
  link.download = `참석응답-${new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())}.csv`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
