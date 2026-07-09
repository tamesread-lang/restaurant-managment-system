import { supabase } from './config.js';
import { sanitizeHTML, formatCurrency } from './utils.js';

/**
 * جلب وعرض الأقسام والوجبات داخل لوحة التحكم
 */
export async function loadMenuAdmin() {
    // 1. جلب الأقسام
    const { data: categories, error: catErr } = await supabase
        .from('menu_categories')
        .select('*')
        .order('sort_order', { ascending: true });

    if (catErr) return;

    const tagsContainer = document.getElementById('categories-list');
    const selectCategory = document.getElementById('item-category');
    
    tagsContainer.innerHTML = '';
    selectCategory.innerHTML = '<option value="">اختر القسم...</option>';

    categories.forEach(cat => {
        tagsContainer.innerHTML += `
            <div class="category-tag">
                <span>${sanitizeHTML(cat.name)}</span>
                <button class="btn-delete-cat" style="background:none; border:none; color:red; cursor:pointer;" data-id="${cat.id}">×</button>
            </div>
        `;
        selectCategory.innerHTML += `<option value="${cat.id}">${sanitizeHTML(cat.name)}</option>`;
    });

    // 2. جلب الوجبات كاملة
    const { data: items, error: itemErr } = await supabase
        .from('menu_items')
        .select('*, menu_categories(name)');

    if (itemErr) return;

    const grid = document.getElementById('menu-items-grid');
    grid.innerHTML = '';

    items.forEach(item => {
        grid.innerHTML += `
            <div class="menu-item-card">
                <img src="${item.image_url || 'https://placehold.co/300x200?text=No+Image'}" alt="${sanitizeHTML(item.title)}">
                <h4>${sanitizeHTML(item.title)}</h4>
                <p style="font-size:0.85rem; color:var(--text-muted);">${sanitizeHTML(item.description || '')}</p>
                <div style="font-weight:bold; margin: 5px 0;">${formatCurrency(item.price)}</div>
                <div style="margin-bottom:10px; font-size:0.8rem;">
                    الحالة: ${item.is_available ? '<span style="color:green;">متوفرة</span>' : '<span style="color:red;">غير متوفرة</span>'}
                </div>
                <div style="display:flex; gap:5px; justify-content:center;">
                    <button class="btn btn-primary btn-sm btn-edit-item" data-id="${item.id}">تعديل</button>
                    <button class="btn btn-danger btn-sm btn-delete-item" data-id="${item.id}">حذف</button>
                </div>
            </div>
        `;
    });

    bindMenuEvents();
}

function bindMenuEvents() {
    // حذف قسم
    document.querySelectorAll('.btn-delete-cat').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if(!confirm("حذف القسم سيؤدي لحذف جميع وجباته تلقائياً، هل أنت متأكد؟")) return;
            const id = e.target.dataset.id;
            await supabase.from('menu_categories').delete().eq('id', id);
            loadMenuAdmin();
        });
    });

    // حذف وجبة
    document.querySelectorAll('.btn-delete-item').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if(!confirm("هل أنت متأكد من حذف هذه الوجبة؟")) return;
            const id = e.target.dataset.id;
            await supabase.from('menu_items').delete().eq('id', id);
            loadMenuAdmin();
        });
    });

    // فتح واجهة تعديل وجبة
    document.querySelectorAll('.btn-edit-item').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            const { data: item } = await supabase.from('menu_items').select('*').eq('id', id).single();
            if (item) {
                document.getElementById('item-id').value = item.id;
                document.getElementById('item-category').value = item.category_id;
                document.getElementById('item-title').value = item.title;
                document.getElementById('item-price').value = item.price;
                document.getElementById('item-description').value = item.description;
                document.getElementById('item-image').value = item.image_url;
                document.getElementById('item-available').checked = item.is_available;
                
                document.getElementById('item-modal-title').textContent = "تعديل الوجبة";
                document.getElementById('modal-item').classList.remove('hidden');
            }
        });
    });
}