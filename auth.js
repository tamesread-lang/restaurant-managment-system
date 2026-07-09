import { supabase } from './config.js';
import { sanitizeHTML } from './utils.js';

const loginForm = document.getElementById('login-form');
const errorMsg = document.getElementById('error-msg');
const btnSubmit = document.getElementById('btn-submit');

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // جلب وتطهير المدخلات من أي أكواد خبيثة
        const email = sanitizeHTML(document.getElementById('email').value.trim());
        const password = document.getElementById('password').value;

        if (!email || !password) {
            showError("الرجاء ملء جميع الحقول المطلوبة.");
            return;
        }

        btnSubmit.disabled = true;
        btnSubmit.textContent = "جاري التحقق...";
        hideError();

        // تنفيذ عملية تسجيل الدخول عبر Supabase Auth
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            showError("فشل تسجيل الدخول: " + error.message);
            btnSubmit.disabled = false;
            btnSubmit.textContent = "دخول";
        } else {
            // توجيه المستخدم مباشرة إلى لوحة التحكم فور النجاح
            window.location.href = 'dashboard.html';
        }
    });
}

function showError(msg) {
    if(errorMsg) {
        errorMsg.textContent = msg;
        errorMsg.classList.remove('hidden');
    }
}

function hideError() {
    if(errorMsg) {
        errorMsg.classList.add('hidden');
    }
}

/**
 * دالة التحقق من أن المستخدم مسجل دخوله بالفعل (لحماية مسار لوحة التحكم)
 */
export async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        window.location.href = 'login.html';
    }
    return session;
}

/**
 * دالة تسجيل الخروج وتدمير الجلسة الحالية
 */
export async function logout() {
    await supabase.auth.signOut();
    window.location.href = 'login.html';
}