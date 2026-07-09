/**
 * تشغيل الصوت التحذيري فورا عند رصد طلب جديد وافد من النظام السحابي
 */
export function playNotificationSound() {
    const audio = document.getElementById('notification-sound');
    if (audio) {
        audio.currentTime = 0; // إعادة البدء من البداية لضمان التشغيل المتلاحق
        audio.play().catch(err => console.log("تمنع سياسات المتصفح التشغيل التلقائي للصوت حتى يتفاعل المستخدم أولاً."));
    }
}