# راه‌اندازی یک‌باره آپدیت از داخل پنل (بدون SSH در دفعات بعد)

این روش از GitHub Actions استفاده می‌کند. اپلیکیشن React و Backend به Docker socket، SSH خصوصی یا اجرای shell دسترسی ندارند. تنها **مدیر اصلی** می‌تواند یک workflow مشخص را روی شاخه `main` اجرا کند.

## پیش‌نیاز

- کد نسخه ۶ از قبل در `main` مخزن GitHub و روی سرور مستقر باشد.
- SSH به سرور برای یک مرحله راه‌اندازی اولیه موجود باشد.
- دامنه/HTTPS و Docker Compose و PostgreSQL سالم باشند.
- دسترسی مالک مخزن به Settings → Environments و Secrets در GitHub.

## ۱. کلید مخصوص انتشار بسازید

در سیستم مدیریت امن خود (نه داخل وب‌اپ و نه در چت):

```bash
ssh-keygen -t ed25519 -f "$HOME/.ssh/personal-dashboard-deploy" -C github-dashboard-deploy -N ''
```

فایل دارای پسوند `.pub` عمومی است. فایل بدون `.pub` **کلید خصوصی** است و هرگز داخل مخزن آپلود نمی‌شود.

## ۲. نصب یک‌باره فرمان محدودشده روی سرور

بعد از ارتقا به v6، با دسترسی مدیر سرور:

```bash
cd /opt/markaz
sudo bash scripts/setup-web-updates.sh 'ssh-ed25519 AAAA... github-dashboard-deploy'
```

رشته داخل کوتیشن را با **کلید عمومی واقعی** جایگزین کنید. این اسکریپت کاربر `deploy` و `authorized_keys` با `restrict,command=...` می‌سازد و تنها دستور `sudo -n /usr/local/sbin/personal-dashboard-update` را مجاز می‌کند. این راه‌اندازی نیاز به SSH دارد، اما هر انتشار بعدی از داخل پنل آغاز می‌شود.

## ۳. GitHub Environment Secrets

در مخزن، بخش Settings → Environments → `production` را بسازید و Secretهای زیر را اضافه کنید:

| Secret | مقدار |
|---|---|
| `DEPLOY_HOST` | IP یا دامنه سرور |
| `DEPLOY_PORT` | پورت SSH، معمولاً `22` |
| `DEPLOY_SSH_KEY` | متن کامل کلید خصوصی ساخته‌شده |
| `DEPLOY_KNOWN_HOSTS` | خط کلید میزبان SSH پس از تأیید fingerprint از مسیر مستقل |

برای دریافت fingerprint روی سرور: `sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`. اگر از `ssh-keyscan` استفاده می‌کنید، خروجی را **بدون تأیید مستقل** معتبر تلقی نکنید.

فایل `.github/workflows/deploy.yml` باید در `main` وجود داشته باشد. این workflow فقط با `workflow_dispatch` اجرا می‌شود؛ مجوز `contents: read` دارد و به دستور تعیین‌شده متصل می‌شود.

## ۴. توکن GitHub برای فعال‌کردن دکمه

در GitHub یک Fine-grained Personal Access Token فقط برای همین مخزن بسازید، با مجوز **Actions: Read and Write**. توکن را در **پنل → آپدیت برنامه** ثبت کنید، همراه با:

```
Hosseinmehrfard/Personal-Management-Dashboard
```

توکن روی سرور با AES-256-GCM رمزگذاری می‌شود و به مرورگر بازگردانده نمی‌شود. در مخزن و فایل JSON پشتیبان هم ذخیره نمی‌شود.

## ۵. استفاده روزانه

۱. کد جدید را در GitHub شاخه `main` ثبت کنید.
۲. پنل را با حساب مدیر باز کنید و «آپدیت برنامه → شروع آپدیت از GitHub» را بزنید.
۳. «بررسی وضعیت انتشار» را بزنید؛ خروجی workflow را در GitHub Actions ببینید.

فرمان سمت سرور: پشتیبان `pg_dump`، دریافت fast-forward از `main`، ساخت و راه‌اندازی کانتینرها، کنترل وضعیت Docker و health check. اگر هر مرحله خطا بدهد workflow خطا ثبت می‌کند؛ rollback خودکار انجام نمی‌شود.

**امنیت:** دسترسی Actions به انتشار روی سرور قدرت بالایی دارد. برای GitHub مخزن MFA، محافظت شاخه `main`، محدودسازی دسترسی مدیران و محیط `production` با تأیید انتشار در نظر بگیرید. هر شخصی با قابلیت تغییر فایل workflow یا کد اصلی ممکن است بر سرور اثر بگذارد.
