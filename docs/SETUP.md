# 첫 공개를 위한 연결 안내

GitHub Pages는 청첩장 화면을 제공하고, Supabase는 로그인·사진·공개 내용을 저장합니다. 아래 연결은 처음 한 번만 필요합니다. 무료 요금제로 시작할 수 있지만 서비스 정책·용량·사용량에 따라 한도와 비용이 달라질 수 있습니다. 예식 전에는 Supabase 프로젝트가 활성 상태인지 확인하세요.

## 1. Supabase 프로젝트 만들기

1. [Supabase](https://supabase.com/dashboard)에서 새 프로젝트를 만듭니다. 가까운 리전을 선택하고 데이터베이스 비밀번호는 안전한 곳에 보관합니다.
2. 프로젝트의 **SQL Editor**에서 [001_wedding.sql](../supabase/migrations/001_wedding.sql) 전체를 실행합니다. 관리자 전용 데이터와 사진 저장 버킷이 생성됩니다. 같은 파일을 다시 실행해도 데이터가 삭제되지 않습니다.
3. **Project Settings → API / API Keys**에서 프로젝트 URL과 **Publishable key** 또는 기존 **anon/public key**를 확인합니다. 두 값은 웹 브라우저에 포함되는 공개 설정이며, 권한은 SQL의 RLS 정책으로 제한합니다. **Secret key나 `service_role` 키를 사용하지 마세요.**

## 2. 주영님 관리자 계정 등록

1. **Authentication → Users → Add user → Create new user**에서 주영님 이메일과 비밀번호로 사용자를 만듭니다. **Auto Confirm User**를 켜서 초기 계정을 확인된 상태로 생성합니다. 비밀번호는 채팅·저장소에 적지 말고 주영님께 안전하게 전달하세요.
2. SQL Editor에서 실제 관리자 이메일로 아래 쿼리를 실행합니다.

```sql
insert into public.wedding_admins (user_id)
select id from auth.users
where lower(email) = lower('여기에-주영님-이메일')
on conflict (user_id) do nothing;
```

3. 아래 쿼리가 `1`인지 확인합니다. `0`이면 이메일 오타나 사용자 생성 여부를 먼저 확인하세요.

```sql
select count(*) as administrator_count from public.wedding_admins;
```

4. **Authentication → Sign In / Providers → Email**에서 이메일 로그인을 사용하고, **Allow new users to sign up**은 끕니다. 이 앱에는 공개 회원가입 기능이 없습니다.
5. **Authentication → URL Configuration**의 **Site URL**을 실제 공개 기본 주소로 설정합니다. 예: `https://ka8877.github.io/ju_wedding/`. 필요 시 같은 기본 주소를 Redirect URLs에 추가합니다. 관리 페이지 주소는 그 뒤에 `#/admin`을 붙입니다. 현재 로그인은 이메일·비밀번호 방식으로, 해시 경로로 인증 이메일을 리디렉트할 필요가 없습니다.

관리자를 추가하려면 같은 방식으로 사용자 생성 후 목록에 등록합니다. 계정 접근을 철회하려면 SQL Editor에서 해당 `wedding_admins` 행을 삭제하세요. 일반 로그인 사용자는 관리자가 아니면 수정할 수 없습니다.

## 3. GitHub Pages 켜기

1. [저장소 설정](https://github.com/ka8877/ju_wedding/settings/pages)의 **Pages → Build and deployment → Source**를 **GitHub Actions**로 선택합니다. 저장소 요금제·공개 범위가 GitHub Pages를 지원해야 합니다.
2. **Settings → Secrets and variables → Actions → Variables**에서 두 Repository variables를 추가합니다.

| 이름 | 값 |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable 또는 anon/public key |

3. `main`에 코드를 반영하거나 **Actions → Test and deploy invitation → Run workflow**를 실행합니다.
4. 검사와 배포가 모두 성공하면 Pages에 표시되는 URL을 엽니다. 기본 주소는 `https://ka8877.github.io/ju_wedding/`이며, 실제 공개 여부는 Actions 결과와 Pages 설정에서 확인해야 합니다.
5. 관리 페이지는 `https://ka8877.github.io/ju_wedding/#/admin`입니다. 앞에서 만든 이메일·비밀번호로 로그인합니다.

설정 값을 바꾼 후에는 workflow를 다시 실행해야 빌드에 반영됩니다. 두 값이 없으면 미리보기 모드로 빌드되며, 공개 저장 기능은 연결되지 않습니다.

## 4. 첫 초대장 공개와 확인

1. 관리자 계정으로 로그인해 사진과 문구를 입력하고 **임시 저장**합니다.
2. 미리보기로 사진 순서·오타·주소·계좌번호를 확인합니다.
3. **공개**하면 하객용 청첩장에 반영됩니다. 공개 후 다른 휴대폰이나 시크릿 창에서 기본 주소를 새로 열어 확인합니다.
4. 날짜와 시간은 한국 시간 기준입니다. 예식 장소 검색 결과는 반드시 주소와 지도 위치를 확인한 뒤 선택하세요.

실제 연결 후 다음 항목을 확인하세요. 이 절차를 하지 않은 상태를 전체 기능 검증 완료로 간주하면 안 됩니다.

저장소의 `npm run test:db`는 실제 PostgreSQL(PGlite) 엔진에서 SQL·RLS 정책 17개를 검증합니다. Supabase 역할과 `auth`·`storage` 스키마를 메모리에 모의 구성해 익명·일반 사용자·관리자의 권한과 초안/공개 분리, SQL 재실행을 확인합니다. 이 검사는 호스팅된 Supabase 서비스에 접속하지 않으며, 실제 로그인·Storage API 파일 형식/크기 제한·CDN 동작 검증을 대신하지 않습니다.

- 로그인하지 않은 시크릿 창에서 공개 청첩장은 읽히고, 관리 페이지에서는 로그인이 요구되는지 확인합니다.
- 임시 저장만 한 변경이 시크릿 창에는 나타나지 않고 **공개** 후 새로고침하면 나타나는지 확인합니다.
- 업로드 사진이 다른 기기에서도 열리는지, 장소 지도·길찾기·주소 복사가 작동하는지 확인합니다.
- Supabase에서 관리자 목록에 없는 테스트 사용자를 만들었다면 데이터와 사진을 수정할 수 없는지 확인하고 계정을 삭제합니다.
- Supabase SQL에서 `wedding_content`와 `wedding_admins`의 RLS가 활성화돼 있는지 확인합니다. API 키를 숨기는 것으로 RLS를 대신하지 마세요.

## 5. 이름을 담은 도메인 연결

후보는 **`juyoung-hyunbeom.com`**입니다. 아직 등록 여부를 확인하지 않았으며, 실제 구매는 등록기관에서 가능 여부·갱신 가격을 확인한 다음 진행합니다. 이 저장소는 도메인을 자동 구매하지 않습니다.

1. 선택한 도메인을 구매합니다. GitHub 계정 설정의 **Pages → Add a domain**으로 도메인을 검증하면 다른 저장소에 도메인이 연결되는 일을 줄일 수 있습니다.
2. 저장소 **Settings → Pages → Custom domain**에 소유한 도메인을 입력합니다.
3. 도메인 등록기관의 DNS에서 GitHub의 [최신 커스텀 도메인 안내](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)에 따라 apex `A`/`AAAA` 레코드와 `www` CNAME을 설정합니다. IP 주소는 공식 문서의 현재 값을 사용하세요. 등록기관의 URL 전달 기능으로 대체하지 마세요.
4. Repository Actions variable **`CUSTOM_DOMAIN`**에 도메인만 입력합니다. 예: `juyoung-hyunbeom.com` (`https://`, 경로, 슬래시 제외). 이 변수가 설정되면 빌드는 루트 경로(`/`)를 사용하고 `CNAME` 파일을 생성합니다. **도메인을 소유하고 연결한 뒤** 설정하세요.
5. workflow를 다시 실행합니다. DNS 전파와 인증서 발급 후 Pages 설정에서 **Enforce HTTPS**를 켭니다.
6. Supabase의 Site URL도 새 기본 주소로 바꿉니다. 휴대폰에서 HTTPS, 청첩장, `#/admin`, 로그인, 사진 저장을 다시 확인합니다.

설정 전까지는 기본 GitHub Pages 주소로 검토할 수 있습니다. 도메인이 실제로 연결되기 전에는 후보를 공개 주소라고 안내하지 마세요.

## 로컬 개발 설정

`.env.example`을 `.env.local`로 복사하고 URL과 공개 키를 입력합니다. `.env.local`은 Git에서 제외됩니다. 개발 서버를 다시 시작하면 반영됩니다.

```bash
cp .env.example .env.local
npm ci
npm run dev
```

관리자 비밀번호와 Supabase secret/service-role 키는 `.env.local`에도 필요 없습니다. 로그인 화면에서 이메일·비밀번호로 인증합니다. 코드 변경은 GitHub 배포, 초대장 내용 변경은 관리 페이지에서 수행합니다.

## 장애 확인

- **로그인되지만 저장 실패:** `wedding_admins`에 로그인 사용자의 UUID가 있는지, SQL 전체를 실행했는지 확인합니다.
- **로그인 실패:** 이메일·비밀번호, 사용자 확인 상태, Supabase 프로젝트 활성 상태를 확인합니다. 관리자 자격을 얻기 위해 RLS를 끄지 마세요.
- **사진 실패:** JPG/PNG/WebP/AVIF, 8 MiB 이하인지 확인합니다. iPhone HEIC는 JPG 변환이 필요합니다. 저장소 용량·버킷 정책도 확인합니다.
- **다른 기기에 변경 없음:** 미리보기 모드인지 확인하고, 임시 저장 다음에 공개까지 했는지 확인합니다. 두 Repository variables를 변경했다면 다시 빌드합니다.
- **도메인에서 빈 화면:** 도메인 설정과 `CUSTOM_DOMAIN`, 빌드의 base 경로가 서로 맞는지 확인하고 Actions를 다시 실행합니다.
- **지도 검색 없음:** 검색 서비스 사용 한도나 지역별 데이터 차이일 수 있습니다. 정확한 주소를 입력하고 좌표를 확인해 직접 지정하거나 지도 앱 링크로 안내할 수 있습니다.

관리 화면에서 갤러리 항목을 빼더라도 기존에 공유된 사진 URL은 유효할 수 있습니다. 완전 삭제가 필요하면 다른 공개 항목에서 사용하지 않는 파일임을 확인하고 Supabase **Storage → wedding-photos**에서 해당 파일을 삭제하세요. 삭제한 사진을 쓰던 기존 청첩장에서는 이미지가 사라집니다.
