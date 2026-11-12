# ارتقا از ۵.۲ به ۶.۰ بدون حذف اطلاعات

۱. کد کامل بسته جدید را در ریشه مخزن GitHub بارگذاری و روی شاخه `main` ثبت کنید. فایل‌های `.env`، دیتابیس و کلیدهای خصوصی را هرگز منتشر نکنید.

۲. نخست روی سرور نسخه PostgreSQL ۵.۲ را پشتیبان بگیرید:

```bash
cd /opt/markaz && sudo bash backup-db.sh && sudo ls -lh backups/
```

فایل `backups/*.dump` را پیش از هر تغییر، خارج از سرور نیز نسخه‌برداری کنید.

۳. پس از اطمینان از صحت پشتیبان، ارتقا:

```bash
cd /opt/markaz && sudo git status --short && sudo git pull --ff-only origin main && sudo docker compose --profile https up -d --build --remove-orphans && sudo docker compose ps
```

اگر `git status` تغییر محلی نشان داد، رفع تعارض لازم است؛ `git reset --hard` توصیه نمی‌شود.

۴. بررسی سرویس‌ها و نسخه:

```bash
cd /opt/markaz && sudo docker compose ps && sudo docker compose logs --tail=100 app
```

۵. وارد همان دامنه قبلی شوید. ادمین قبلی باقی می‌ماند؛ نیازی به ساخت حساب مجدد نیست. از پنل مدیریت کاربران حساب‌های جدید ایجاد کنید. کلاس‌های OWASP قبلی باید زیر «کلاس‌ها» قابل مشاهده باشند.

۶. `name: markaz` در `compose.yaml` را تغییر ندهید. این نام از قبل مالک Volume دیتابیس بوده و برای جلوگیری از ایجاد Volume تازه عمداً حفظ شده است. فایل `.env` موجود هم باید حفظ شود.

**اجرای تک‌دستوری ارتقا (پس از پشتیبان خارج‌ازسرور):**

```bash
cd /opt/markaz && sudo bash backup-db.sh && sudo git pull --ff-only origin main && sudo docker compose --profile https up -d --build --remove-orphans && sudo docker compose ps
```

**هشدار:** Migration در یک تراکنش SQL اجرا می‌شود، اما برگشت خودکار پس از تغییرات schema پیاده‌سازی نشده است. قابلیت برگرداندن نسخه وابسته به dump معتبر، نقطه بازیابی و دستورهای restore صحیح است. ارتقا ابتدا روی نسخه آزمایشی دیتابیس توصیه می‌شود.
