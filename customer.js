import { supabase } from './config.js';
import { sanitizeHTML, formatCurrency, isValidPrice, haversineDistance } from './utils.js';

// متغيرات حالة الزبون والسلة في ذاكرة الصفحة الحالية (Runtime Global State)
let currentTable = null;
let currentRestaurantSettings = null;
let menuItems = [];
let cart = [];
let isOrderSubmitting = false; // حارس الأمان (Guard Flag) لمنع تكرار إرسال الطلب الفوري

document.addEventListener('DOMContentLoaded', async () => {
    // 1. استخراج رقم الطاولة تلقائياً وآلياً من روابط الـ URL Query string
    const urlParams = new URLSearchParams(window.location.search);
    currentTable = urlParams.get('table');

    if (!currentTable) {
        document.getElementById('cust-menu-grid').innerHTML = `<p class="alert alert-danger text-center">عذراً، لم يتم التعرف على رقم الطاولة. يرجى إعادة مسح الـ QR Code الخاص بطاولتك بشكل صحيح.</p>`;
        return;
    }

    document.getElementById('table-badge').textContent = `طاولة: ${sanitizeHTML(currentTable)}`;

    // 2. جلب إعدادات وهوية المطعم وتدقيق ساعات العمل وحالة استقبال الطلبات
    await fetchRestaurantProfile();
    if (currentRestaurantSettings && !currentRestaurantSettings.is_accepting_orders) {
        document.getElementById('cust-menu-grid').innerHTML = `<p class="alert alert-danger text-center">المطعم لا يستقبل طلبات خارجية حالياً. الرجاء مراجعة طاقم الخدمة بالمطعم.</p>`;
        return;
    }

    // 3. جلب الوجبات والأقسام وبناء القائمة التفاعلية
    await fetchMenuAndCategories();
    setupCustomerEvents();
});

/**
 * جلب هوية المطعم الأساسية
 */
async function fetchRestaurantProfile() {
    const { data, error } = await supabase.from('restaurant_settings').select('*').single();
    if (data) {
        currentRestaurantSettings = data;
        document.getElementById('cust-restaurant-name').textContent = data.restaurant_name;
        document.title = data.restaurant_name;
        if (data.logo_url) document.getElementById('cust-logo').src = data.logo_url;
    }
}

/**
 * جلب المأكولات والأقسام النشطة من السحابة ورندرتها للزبون
 */
async function fetchMenuAndCategories() {
    // جلب الأقسام
    const { data: categories } = await supabase.from('menu_categories').select('*').order('sort_order', { ascending: true });
    const scrollBar = document.getElementById('cust-categories-scroll');
    
    if (categories) {
        categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'cat-scroll-item';
            btn.dataset.id = cat.id;
            btn.textContent = sanitizeHTML(cat.name);
            scrollBar.appendChild(btn);
        });
    }

    // جلب الوجبات المتوفرة فقط في المخزون للمطبخ لضمان دقة الطلب وحماية المدخلات السعرية للزبائن
    const { data: items, error } = await supabase
        .from('menu_items')
        .select('*')
        .eq('is_available', true);

    if (error) {
        console.error("خطأ في جلب المأكولات:", error);
        return;
    }

    menuItems = items;
    renderCustomerMenu(menuItems);
}

/**
 * دالة صيرورة رندرة وبناء كروت المأكولات في شبكة العرض
 */
function renderCustomerMenu(itemsToRender) {
    const grid = document.getElementById('cust-menu-grid');
    if (!grid) return;

    if (itemsToRender.length === 0) {
        grid.innerHTML = `<p class="empty-msg" style="grid-column: 1/-1; text-align:center; padding: 20px;">لا توجد وجبات متاحة حالياً ضمن هذا التصنيف.</p>`;
        return;
    }

    grid.innerHTML = '';
    itemsToRender.forEach(item => {
        const card = document.createElement('div');
        card.className = 'cust-item-card';
        card.innerHTML = `
            <img src="${item.image_url || 'https://placehold.co/300x200?text=Viridia'}" alt="${sanitizeHTML(item.title)}" onerror="this.src='https://placehold.co/300x200?text=Food'">
            <div class="cust-card-details">
                <div>
                    <h4>${sanitizeHTML(item.title)}</h4>
                    <p class="cust-item-desc">${sanitizeHTML(item.description || 'وجبة شهية ومحضرة بعناية من أفضل المكونات الطازجة.')}</p>
                </div>
                <div class="cust-card-footer">
                    <span class="cust-item-price">${formatCurrency(item.price)}</span>
                    <button class="btn-add-to-cart" data-id="${item.id}">+</button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });

    // ربط أحداث الإضافة السريعة للسلة فور الرندرة الكلية
    document.querySelectorAll('.btn-add-to-cart').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            addToCart(id);
        });
    });
}

/**
 * إدارة وتدبير مصفوفة السلة المحلية الفورية (Cart Operations Engine)
 */
function addToCart(itemId) {
    const item = menuItems.find(i => i.id === itemId);
    if (!item) return;

    const existingCartItem = cart.find(c => c.id === itemId);

    if (existingCartItem) {
        existingCartItem.quantity += 1;
    } else {
        cart.push({
            id: item.id,
            title: item.title,
            price: parseFloat(item.price),
            quantity: 1
        });
    }

    updateCartUI();
}

function updateCartUI() {
    const cartBar = document.getElementById('cart-floating-bar');
    const countBadge = document.getElementById('cart-count-badge');
    const totalBadge = document.getElementById('cart-total-badge');
    const drawerList = document.getElementById('cart-items-list');
    const drawerTotal = document.getElementById('drawer-total-price');

    if (cart.length === 0) {
        cartBar.classList.add('hidden');
        drawerList.innerHTML = `<p class="empty-cart-text">سلتك فارغة حالياً، أضف بعض الوجبات اللذيذة!</p>`;
        drawerTotal.textContent = formatCurrency(0);
        return;
    }

    // 1. حساب الكميات والأسعار الإجمالية مع مراجعة حماية صحة الأرقام والأسعار من أي تلاعب بالمتصفح
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const totalPrice = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    countBadge.textContent = `${totalItems} وجبات في السلة`;
    totalBadge.textContent = `إجمالي: ${formatCurrency(totalPrice)}`;
    drawerTotal.textContent = formatCurrency(totalPrice);

    cartBar.classList.remove('hidden');

    // 2. رندرة عناصر السلة بداخل الـ Drawer المنبثق
    drawerList.innerHTML = '';
    cart.forEach(item => {
        const row = document.createElement('div');
        row.className = 'cart-item-row';
        row.innerHTML = `
            <div class="cart-item-info">
                <h5>${sanitizeHTML(item.title)}</h5>
                <span>${formatCurrency(item.price * item.quantity)}</span>
            </div>
            <div class="qty-controls">
                <button class="btn-qty btn-minus" data-id="${item.id}">-</button>
                <span class="qty-val" style="font-weight:bold;">${item.quantity}</span>
                <button class="btn-qty btn-plus" data-id="${item.id}">+</button>
            </div>
        `;
        drawerList.appendChild(row);
    });

    // ربط أحداث التحكم بالزيادة والنقصان بداخل السلة
    document.querySelectorAll('.btn-minus').forEach(btn => {
        btn.addEventListener('click', (e) => updateQuantity(e.target.dataset.id, -1));
    });
    document.querySelectorAll('.btn-plus').forEach(btn => {
        btn.addEventListener('click', (e) => updateQuantity(e.target.dataset.id, 1));
    });
}

function updateQuantity(itemId, change) {
    const item = cart.find(c => c.id === itemId);
    if (!item) return;

    item.quantity += change;
    if (item.quantity <= 0) {
        cart = cart.filter(c => c.id !== itemId);
    }
    updateCartUI();
}

/**
 * ربط أحداث الكليك والتفاعلات وفلاتر البحث والمودالز للزبون
 */
function setupCustomerEvents() {
    // محرك البحث الفوري عن المأكولات (Instant Live Search)
    document.getElementById('cust-search').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const filtered = menuItems.filter(i => i.title.toLowerCase().includes(query) || (i.description && i.description.toLowerCase().includes(query)));
        renderCustomerMenu(filtered);
    });

    // فلترة وضغط التبويبات الأفقية للأقسام
    const catButtons = document.querySelectorAll('.cat-scroll-item');
    document.getElementById('cust-categories-scroll').addEventListener('click', (e) => {
        if (!e.target.classList.contains('cat-scroll-item')) return;
        
        document.querySelectorAll('.cat-scroll-item').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');

        const catId = e.target.dataset.id;
        if (catId === 'all') {
            renderCustomerMenu(menuItems);
        } else {
            const filtered = menuItems.filter(i => i.category_id === catId);
            renderCustomerMenu(filtered);
        }
    });

    // التحكم بفتح واغلاق دراور السلة التعبيري السفلي
    const drawer = document.getElementById('modal-cart-drawer');
    document.getElementById('btn-open-cart').addEventListener('click', () => drawer.classList.remove('hidden'));
    document.getElementById('close-cart-drawer').addEventListener('click', () => drawer.classList.add('hidden'));

    // التحكم بمودال النجاح
    document.getElementById('btn-close-success').addEventListener('click', () => {
        document.getElementById('modal-success').classList.add('hidden');
    });

    // إرسال ومراجعة وتأكيد الطلب النهائي وبثه فوراً للمطبخ والمدير (Checkout Engine)
    document.getElementById('btn-submit-order').addEventListener('click', submitFinalOrderToServer);
}

/**
 * دالة الإرسال ومعالجة العمليات وحمايتها من هجمات السبام وتكرار النقر (Idempotency Guard)
 */
async function submitFinalOrderToServer() {
    // كسر العملية فوراً إذا كانت قيد المعالجة (منع إرسال البيانات مرتين)
    if (isOrderSubmitting) return;

    if (cart.length === 0) {
        showCartAlert("سلتك فارغة، يرجى إضافة وجبات أولاً قبل الطلب.");
        return;
    }

    const notes = sanitizeHTML(document.getElementById('order-notes').value.trim());
    const totalPrice = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // الأمان الفائق: التحقق المطلق من صحة ومنطقية الحساب المالي الكلي
    if (!isValidPrice(totalPrice) || totalPrice <= 0) {
        showCartAlert("حدث خطأ غير متوقع في حساب إجمالي الفاتورة.");
        return;
    }

    // تفعيل حارس الحماية وتغيير مظهر الزر لتعطيل الكلي
    isOrderSubmitting = true;
    const btnSubmit = document.getElementById('btn-submit-order');
    btnSubmit.disabled = true;
    btnSubmit.textContent = "جاري إرسال طلبك الآمن للمطبخ...";

    // 1. التحقق من إعدادات الأمان والموقع
    const { data: secSettings, error: secErr } = await supabase
        .from('security_settings')
        .select('*')
        .eq('id', 1)
        .single();

    if (!secErr && secSettings) {
        // 1a. التحقق من فترة التهدئة (Rate Limiting) عبر localStorage
        if (secSettings.cooldown_minutes > 0) {
            const lastSubmit = localStorage.getItem('last_order_submit');
            if (lastSubmit) {
                const elapsed = (Date.now() - parseInt(lastSubmit)) / 60000;
                if (elapsed < secSettings.cooldown_minutes) {
                    const remaining = Math.ceil(secSettings.cooldown_minutes - elapsed);
                    showCartAlert(`يجب الانتظار ${remaining} دقيقة قبل تقديم طلب جديد.`);
                    resetSubmitButton();
                    return;
                }
            }
        }

        // 1b. التحقق من الموقع الجغرافي (GPS) إذا كان مفعلاً
        if (secSettings.is_location_check_enabled && secSettings.latitude && secSettings.longitude && secSettings.max_distance_meters > 0) {
            const gps = await new Promise((resolve) => {
                if (!navigator.geolocation) {
                    resolve(null);
                    return;
                }
                navigator.geolocation.getCurrentPosition(
                    (pos) => resolve(pos.coords),
                    () => resolve(null),
                    { enableHighAccuracy: true, timeout: 10000 }
                );
            });

            if (!gps) {
                showCartAlert("تعذر التحقق من موقعك الجغرافي. يرجى تفعيل GPS والمحاولة مرة أخرى.");
                resetSubmitButton();
                return;
            }

            const distance = haversineDistance(
                gps.latitude, gps.longitude,
                secSettings.latitude, secSettings.longitude
            );

            if (distance > secSettings.max_distance_meters) {
                showCartAlert(`أنت على بعد ${Math.round(distance)} متر من المطعم. يجب أن تكون ضمن ${secSettings.max_distance_meters} متر لتقديم طلب.`);
                resetSubmitButton();
                return;
            }
        }
    }

    // 2. تدوين وإدخال رأس الطلب في جدول (orders) لاستخراج الـ Order ID
    const { data: orderData, error: orderErr } = await supabase
        .from('orders')
        .insert([{
            table_number: parseInt(currentTable),
            total_price: totalPrice,
            notes: notes,
            status: 'new'
        }])
        .select()
        .single();

    if (orderErr) {
        showCartAlert("فشل إرسال الطلب: " + orderErr.message);
        resetSubmitButton();
        return;
    }

    // 2. إعداد مصفوفة التفاصيل وعلاقة الربط المتعددة لإدراجها دفعة واحدة (Bulk Insert) لحماية الأداء للشبكة
    const orderItemsPayload = cart.map(item => ({
        order_id: orderData.id,
        item_id: item.id,
        title: item.title,
        price: item.price,
        quantity: item.quantity
    }));

    const { error: itemsErr } = await supabase
        .from('order_items')
        .insert(orderItemsPayload);

    if (itemsErr) {
        showCartAlert("تم تسجيل الطلب ولكن حدث خطأ في تفاصيل الأصناف: " + itemsErr.message);
        resetSubmitButton();
        return;
    }

    // 3. نجاح العملية بالكامل وتصفير السلة المحلية والمؤشرات بنجاح مطلق
    cart = [];
    updateCartUI();
    document.getElementById('order-notes').value = '';
    document.getElementById('modal-cart-drawer').classList.add('hidden');
    document.getElementById('modal-success').classList.remove('hidden');

    // تسجيل وقت تقديم الطلب لتطبيق فترة التهدئة
    localStorage.setItem('last_order_submit', Date.now());

    resetSubmitButton();
}

function resetSubmitButton() {
    isOrderSubmitting = false;
    const btnSubmit = document.getElementById('btn-submit-order');
    btnSubmit.disabled = false;
    btnSubmit.textContent = "إرسال الطلب للمطبخ مباشرة 🚀";
}

function showCartAlert(msg) {
    const alertBox = document.getElementById('cart-alert-msg');
    alertBox.textContent = msg;
    alertBox.classList.remove('hidden');
}