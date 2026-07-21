import { supabase } from './config.js';
import { formatCurrency, formatTime, sanitizeHTML } from './utils.js';
import { playNotificationSound } from './notifications.js';

// مصفوفة محلية للاحتفاظ بالطلبات في الذاكرة لتسهيل الفلترة والترتيب السريع
let localOrders = [];

/**
 * جلب جميع الطلبات الخاصة باليوم الحالي وحساب الإحصائيات
 */
export async function loadOrdersAndStats() {
    const today = new Date().toISOString().split('T')[0];
    
    // جلب الطلبات مع تفاصيل الوجبات المرتبطة بها بنظام الجوين (Join Query)
    const { data, error } = await supabase
        .from('orders')
        .select(`
            *,
            order_items (*)
        `)
        .gte('created_at', today)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("خطأ في جلب الطلبات:", error);
        return;
    }

    localOrders = data;
    renderStats();
    renderOrders(localOrders);
}

/**
 * حساب وعرض الإحصائيات في واجهة المستخدم
 */
function renderStats() {
    const current = localOrders.filter(o => ['new', 'preparing', 'ready'].includes(o.status)).length;
    const completed = localOrders.filter(o => o.status === 'delivered').length;
    const cancelled = localOrders.filter(o => o.status === 'cancelled').length;

    const countNew = localOrders.filter(o => o.status === 'new').length;
    const countPreparing = localOrders.filter(o => o.status === 'preparing').length;
    const countReady = localOrders.filter(o => o.status === 'ready').length;
    const countDelivered = localOrders.filter(o => o.status === 'delivered').length;
    
    const dailyEarnings = localOrders
        .filter(o => o.status === 'delivered')
        .reduce((sum, o) => sum + parseFloat(o.total_price), 0);

    document.getElementById('stat-current-orders').textContent = current;
    document.getElementById('stat-completed-orders').textContent = completed;
    document.getElementById('stat-cancelled-orders').textContent = cancelled;
    document.getElementById('stat-daily-earnings').textContent = formatCurrency(dailyEarnings);

    // تحديث بطاقات حالة الطلبات المباشرة
    const elNew = document.getElementById('status-count-new');
    const elPreparing = document.getElementById('status-count-preparing');
    const elReady = document.getElementById('status-count-ready');
    const elDelivered = document.getElementById('status-count-delivered');
    if (elNew) elNew.textContent = countNew;
    if (elPreparing) elPreparing.textContent = countPreparing;
    if (elReady) elReady.textContent = countReady;
    if (elDelivered) elDelivered.textContent = countDelivered;
    
    // الأرباح الشهرية (استعلام سريع منفصل للاحتساب)
    calculateMonthlyEarnings();
}

async function calculateMonthlyEarnings() {
    const firstDayOfMonth = new Date();
    firstDayOfMonth.setDate(1);
    const startString = firstDayOfMonth.toISOString().split('T')[0];

    const { data } = await supabase
        .from('orders')
        .select('total_price')
        .eq('status', 'delivered')
        .gte('created_at', startString);

    const monthlyTotal = data ? data.reduce((sum, o) => sum + parseFloat(o.total_price), 0) : 0;
    document.getElementById('stat-monthly-earnings').textContent = formatCurrency(monthlyTotal);
}

/**
 * صيرورة رسم بطاقات الطلبات في الصفحة مع الفلاتر والترتيب
 */
export function renderOrders(ordersToRender) {
    const container = document.getElementById('orders-live-container');
    if (!container) return;

    if (ordersToRender.length === 0) {
        container.innerHTML = `<p class="empty-msg">لا توجد طلبات تطابق الفلترة الحالية.</p>`;
        return;
    }

    container.innerHTML = '';
    ordersToRender.forEach(order => {
        const card = document.createElement('div');
        card.className = `order-card status-${order.status}`;
        
        let itemsHTML = '';
        order.order_items.forEach(item => {
            itemsHTML += `<li><span>${sanitizeHTML(item.title)} × ${item.quantity}</span> <span>${formatCurrency(item.price * item.quantity)}</span></li>`;
        });

        // تحديد أزرار التحكم بناءً على حالة الطلب الحالية
        let actionsHTML = '';
        if (order.status === 'new') {
            actionsHTML = `
                <button class="btn btn-primary btn-sm btn-action" data-id="${order.id}" data-next="preparing">قبول وتحضير</button>
                <button class="btn btn-danger btn-sm btn-action" data-id="${order.id}" data-next="cancelled">رفض</button>
            `;
        } else if (order.status === 'preparing') {
            actionsHTML = `<button class="btn btn-warning btn-sm btn-action" data-id="${order.id}" data-next="ready">جاهز للتسليم</button>`;
        } else if (order.status === 'ready') {
            actionsHTML = `<button class="btn btn-primary btn-sm btn-action" data-id="${order.id}" data-next="delivered">تم التسليم النهائي</button>`;
        }

        card.innerHTML = `
            <div class="order-header">
                <span>طلب #${order.order_number} (طاولة ${order.table_number})</span>
                <span class="order-time">${formatTime(order.created_at)}</span>
            </div>
            <div class="order-details">
                <ul>${itemsHTML}</ul>
                ${order.notes ? `<p class="order-notes"><strong>ملاحظات:</strong> ${sanitizeHTML(order.notes)}</p>` : ''}
                <div class="order-total"><strong>الإجمالي:</strong> ${formatCurrency(order.total_price)}</div>
            </div>
            <div class="order-actions">
                ${actionsHTML}
                <button class="btn btn-secondary btn-sm btn-print" data-id="${order.id}">🖨️ طباعة</button>
            </div>
        `;
        container.appendChild(card);
    });

    // ربط أحداث الأزرار ديناميكياً بعد الرسم
    document.querySelectorAll('.btn-action').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            const nextStatus = e.target.dataset.next;
            await updateOrderStatus(id, nextStatus);
        });
    });

    document.querySelectorAll('.btn-print').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.closest('.btn-print').dataset.id;
            printInvoice(id);
        });
    });
}

/**
 * تحديث حالة الطلب في قاعدة البيانات
 */
async function updateOrderStatus(orderId, newStatus) {
    const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId);

    if (error) {
        alert("حدث خطأ أثناء تحديث حالة الطلب: " + error.message);
    } else {
        loadOrdersAndStats(); // إعادة تحميل تحديثية
    }
}

/**
 * الاستماع الفوري والتلقائي للتغييرات (Realtime Subscription)
 */
export function subscribeToOrders() {
    supabase
        .channel('public:orders')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, payload => {
            playNotificationSound();
            // تحديث شارة التنبيهات في القائمة الجانبية
            const badge = document.getElementById('badge-new-orders');
            if (badge) {
                const currentCount = parseInt(badge.textContent) || 0;
                badge.textContent = currentCount + 1;
                badge.classList.remove('hidden');
            }
            loadOrdersAndStats();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
            loadOrdersAndStats();
        })
        .subscribe();
}

/**
 * محرك البحث والفرز والفلترة المحلي الذكي
 */
export function handleSearchAndFilters() {
    const searchVal = document.getElementById('order-search').value.toLowerCase();
    const sortVal = document.getElementById('order-sort').value;
    const filterVal = document.getElementById('order-filter-status').value;

    let filtered = [...localOrders];

    // 1. الفلترة حسب الحالة
    if (filterVal !== 'all') {
        filtered = filtered.filter(o => o.status === filterVal);
    }

    // 2. البحث الذكي (رقم الطلب أو رقم الطاولة)
    if (searchVal) {
        filtered = filtered.filter(o => 
            o.order_number.toString().includes(searchVal) || 
            o.table_number.toString().includes(searchVal)
        );
    }

    // 3. الترتيب والفرز
    if (sortVal === 'time-desc') {
        filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (sortVal === 'time-asc') {
        filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else if (sortVal === 'table-asc') {
        filtered.sort((a, b) => a.table_number - b.table_number);
    }

    renderOrders(filtered);
}

/**
 * حذف وأرشفة طلبات اليوم الفائتة بنهاية الخدمة
 */
export async function clearDayOrders() {
    if (!confirm("هل أنت متأكد من حذف وتصفية جميع طلبات اليوم؟ تأكد من إتمام كافة الحسابات أولاً.")) return;
    const today = new Date().toISOString().split('T')[0];
    
    const { error } = await supabase
        .from('orders')
        .delete()
        .gte('created_at', today);

    if (error) {
        alert("فشلت عملية المسح: " + error.message);
    } else {
        alert("تم تفريغ وبدء يوم عمل جديد بنجاح.");
        loadOrdersAndStats();
    }
}

/**
 * دالة طباعة الفاتورة باحترافية عبر نافذة الطباعة الخاصة بالمتصفح
 */
function printInvoice(orderId) {
    const order = localOrders.find(o => o.id === orderId);
    if (!order) return;

    const printWindow = window.open('', '_blank');
    let itemsRows = '';
    order.order_items.forEach(i => {
        itemsRows += `<tr><td>${sanitizeHTML(i.title)}</td><td>${i.quantity}</td><td>${formatCurrency(i.price * i.quantity)}</td></tr>`;
    });

    printWindow.document.write(`
        <html>
        <head>
            <title>فاتورة طلب #${order.order_number}</title>
            <style>
                body { font-family: sans-serif; direction: rtl; text-align: right; padding: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                th, td { border: 1px solid #ddd; padding: 8px; }
                th { background-color: #f2f2f2; }
                .total { font-size: 1.2rem; font-weight: bold; margin-top: 15px; text-align: left; }
            </style>
        </head>
        <body>
            <h2>فاتورة مطعم Viridia</h2>
            <p><strong>رقم الطلب:</strong> ${order.order_number}</p>
            <p><strong>رقم الطاولة:</strong> ${order.table_number}</p>
            <p><strong>التاريخ:</strong> ${new Date(order.created_at).toLocaleString('ar-EG')}</p>
            <table>
                <thead><tr><th>الصنف</th><th>الكمية</th><th>الإجمالي</th></tr></thead>
                <tbody>${itemsRows}</tbody>
            </table>
            <div class="total">الحساب الإجمالي: ${formatCurrency(order.total_price)}</div>
            <script>window.print(); window.close();</script>
        </body>
        </html>
    `);
    printWindow.document.close();
}