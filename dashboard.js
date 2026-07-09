import { checkAuth, logout } from './auth.js';
import { initTheme, toggleTheme, sanitizeHTML } from './utils.js';
import { supabase } from './config.js';
import { loadOrdersAndStats, subscribeToOrders, handleSearchAndFilters, clearDayOrders } from './orders.js';
import { loadMenuAdmin } from './menu.js';
import { loadTablesAdmin } from './tables.js';

// تنفيذ الحماية والتحقق من الهوية فوراً قبل رندرة الصفحة
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    const session = await checkAuth();
    if (!session) return; // سيتم التحويل لصفحة تسجيل الدخول تلقائياً عبر الدالة

    // جلب وحقن إعدادات وهوية المطعم الأساسية
    await loadRestaurantSettings();

    // تشغيل محركات البيانات المباشرة والأنظمة الحية لجدول الطلبات اليومية
    await loadOrdersAndStats();
    subscribeToOrders();

    // تهيئة محركات تبويب اللوحة (Tabs) الأحداث والـ Modals التفاعلية
    setupTabs();
    setupModalsAndForms();
} );

/**
 * جلب وحفظ الإعدادات من وإلى السحابة
 */
async function loadRestaurantSettings() {
    const { data, error } = await supabase.from('restaurant_settings').select('*').single();
    if (data) {
        document.getElementById('nav-restaurant-name').textContent = data.restaurant_name;
        if(data.logo_url) document.getElementById('nav-logo').src = data.logo_url;

        // ملء حقول صفحة الإعدادات
        if (document.getElementById('settings-name')) {
            document.getElementById('settings-name').value = data.restaurant_name;
            document.getElementById('settings-logo').value = data.logo_url || '';
            document.getElementById('settings-opening').value = data.opening_time;
            document.getElementById('settings-closing').value = data.closing_time;
            document.getElementById('settings-accept-orders').checked = data.is_accepting_orders;
        }
    }
}

/**
 * التنقل السلس بين أقسام لوحة التحكم الجانبية (Tabs Router)
 */
function setupTabs() {
    const menuItems = document.querySelectorAll('.sidebar-menu .menu-item');
    const tabContents = document.querySelectorAll('.tab-content');

    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetTab = item.dataset.tab;

            menuItems.forEach(i => i.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            item.classList.add('active');
            document.getElementById(targetTab).classList.add('active');

            // تصفير شارة الإشعارات إذا قام بفتح تبويب الطلبات لقرائتها
            if (targetTab === 'tab-orders') {
                const badge = document.getElementById('badge-new-orders');
                if(badge) badge.classList.add('hidden');
            }

            // لود تكميلي مخصص لكل تبويب لتسريع الأداء وتقليل الكويريز
            if (targetTab === 'tab-menu') loadMenuAdmin();
            if (targetTab === 'tab-tables') loadTablesAdmin();
        });
    });

    // ربط زر الدارك مود وزر الخروج
    document.getElementById('btn-theme-toggle').addEventListener('click', toggleTheme);
    document.getElementById('btn-logout').addEventListener('click', logout);
}

/**
 * تفعيل ومعالجة إرسال النوافذ المنبثقة وحفظ النماذج البرمجية للـ CRUD كاملاً
 */
function setupModalsAndForms() {
    // فلاتر الطلبات والبحث المباشر
    document.getElementById('order-search').addEventListener('input', handleSearchAndFilters);
    document.getElementById('order-sort').addEventListener('change', handleSearchAndFilters);
    document.getElementById('order-filter-status').addEventListener('change', handleSearchAndFilters);
    document.getElementById('btn-clear-day').addEventListener('click', clearDayOrders);

    // معالجة فورمة الإعدادات العامة للمطعم
    document.getElementById('restaurant-settings-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = sanitizeHTML(document.getElementById('settings-name').value.trim());
        const logo = sanitizeHTML(document.getElementById('settings-logo').value.trim());
        const open = document.getElementById('settings-opening').value;
        const close = document.getElementById('settings-closing').value;
        const accept = document.getElementById('settings-accept-orders').checked;

        const { error } = await supabase.from('restaurant_settings').update({
            restaurant_name: name,
            logo_url: logo,
            opening_time: open,
            closing_time: close,
            is_accepting_orders: accept
        }).not('id', 'is', null); // تحديث الصف الوحيد الموجود

        if (error) alert("فشل حفظ الإعدادات: " + error.message);
        else {
            alert("تم تحديث إعدادات المطعم بنجاح الفوري.");
            loadRestaurantSettings();
        }
    });

    // فتح واغلاق نوافذ الإدخال المنبثقة (Modals Controllers)
    document.getElementById('btn-add-category').addEventListener('click', () => {
        document.getElementById('category-id').value = '';
        document.getElementById('form-category').reset();
        document.getElementById('category-modal-title').textContent = "إضافة قسم جديد";
        document.getElementById('modal-category').classList.remove('hidden');
    });
    
    document.getElementById('close-category-modal').addEventListener('click', () => document.getElementById('modal-category').classList.add('hidden'));

    document.getElementById('btn-add-item').addEventListener('click', () => {
        document.getElementById('item-id').value = '';
        document.getElementById('form-item').reset();
        document.getElementById('item-modal-title').textContent = "إضافة وجبة جديدة";
        document.getElementById('modal-item').classList.remove('hidden');
    });
    
    document.getElementById('close-item-modal').addEventListener('click', () => document.getElementById('modal-item').classList.add('hidden'));

    // حفظ قسم جديد
    document.getElementById('form-category').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = sanitizeHTML(document.getElementById('category-name').value.trim());
        const { error } = await supabase.from('menu_categories').insert([{ name }]);
        if (error) alert("خطأ أو القسم مكرر بالفعل!");
        else {
            document.getElementById('modal-category').classList.add('hidden');
            loadMenuAdmin();
        }
    });

    // حفظ أو تعديل وجبة
    document.getElementById('form-item').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('item-id').value;
        const category_id = document.getElementById('item-category').value;
        const title = sanitizeHTML(document.getElementById('item-title').value.trim());
        const price = parseFloat(document.getElementById('item-price').value);
        const description = sanitizeHTML(document.getElementById('item-description').value.trim());
        const image_url = sanitizeHTML(document.getElementById('item-image').value.trim());
        const is_available = document.getElementById('item-available').checked;

        const payload = { category_id, title, price, description, image_url, is_available };

        let result;
        if (id) {
            result = await supabase.from('menu_items').update(payload).eq('id', id);
        } else {
            result = await supabase.from('menu_items').insert([payload]);
        }

        if (result.error) alert("حدث خطأ ما: " + result.error.message);
        else {
            document.getElementById('modal-item').classList.add('hidden');
            loadMenuAdmin();
        }
    });

    // إضافة طاولة جديدة تلقائياً وحساب تسلسلي منطقي رقمي لـ الطاولة التالية
    document.getElementById('btn-add-table').addEventListener('click', async () => {
        const { data: currentTables } = await supabase.from('restaurant_tables').select('table_number');
        const nextNum = currentTables && currentTables.length > 0 ? Math.max(...currentTables.map(t => t.table_number)) + 1 : 1;
        
        const { error } = await supabase.from('restaurant_tables').insert([{ table_number: nextNum }]);
        if (error) alert("فشل إنشاء الطاولة");
        else loadTablesAdmin();
    });
}