import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 1. Ініціалізація змінної (ВИПРАВЛЯЄ journalData is not defined)
let journalData = JSON.parse(localStorage.getItem('tefk_final_v8')) || {
    groups: [],
    subjects: [],
    students: [],
    lessons: [],
    grades: {}
};

const firebaseConfig = {
  apiKey: "AIzaSyDqpy1fAm3BZidnftl8tOB1whwRh7AUG8c",
  authDomain: "journal-6354f.firebaseapp.com",
  projectId: "journal-6354f",
  storageBucket: "journal-6354f.firebasestorage.app",
  messagingSenderId: "1056052681722",
  appId: "1:1056052681722:web:b672e5a62e874663a56243"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Функції для роботи з базою
async function saveToDB() {
    localStorage.setItem('tefk_final_v8', JSON.stringify(journalData));
    updateGlobalStats();
    try {
        await setDoc(doc(db, "journal", "main_data"), journalData);
        console.log("Дані синхронізовано");
    } catch (e) {
        console.error("Помилка Firebase:", e);
    }
}

async function loadDataFromCloud() {
    const docRef = doc(db, "journal", "main_data");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        journalData = docSnap.data();
        renderCurrentTab();
        updateGlobalStats();
        populateSelects();
    }
}

// 2. ГЛОБАЛЬНИЙ ДОСТУП (ВИПРАВЛЯЄ toggleForm is not defined)
// Прив'язуємо функції до window, щоб onclick в HTML їх бачив
window.toggleForm = (id) => document.getElementById(id).classList.toggle('hidden');
window.handleAddLesson = handleAddLesson;
window.handleSaveGroup = handleSaveGroup;
window.handleSaveStudent = handleSaveStudent;
window.handleAddSubject = handleAddSubject;
window.deleteItem = deleteItem;
window.saveGrade = saveGrade;
window.editStudent = editStudent;
window.editSubject = editSubject;
window.editLesson = editLesson;
window.updateStudent = updateStudent;
window.updateSubject = updateSubject;
window.updateLesson = updateLesson;
window.cancelEditStudent = cancelEditStudent;
window.cancelEditSubject = cancelEditSubject;
window.cancelEditLesson = cancelEditLesson;
window.showSubjectDetails = showSubjectDetails;
window.showGroupAnalytics = showGroupAnalytics;
window.renderStudentsList = renderStudentsList;
window.renderJournal = renderJournal;

// Ініціалізація при завантаженні
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    loadDataFromCloud(); // Завантажуємо дані з хмари
    
    // Слухаємо зміни в реальному часі
    onSnapshot(doc(db, "journal", "main_data"), (snapshot) => {
        if (snapshot.exists()) {
            journalData = snapshot.data();
            renderCurrentTab();
            updateGlobalStats();
        }
    });

    document.getElementById('filter-group').addEventListener('change', renderJournal);
    document.getElementById('filter-subject').addEventListener('change', renderJournal);
});

// Решта ваших функцій (formatDate, renderJournal і т.д.) залишається без змін...
// Додайте їх сюди нижче

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
}

function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.target).classList.add('active');
            renderCurrentTab();
        });
    });
}

function updateGlobalStats() {
    document.getElementById('stat-students').textContent = journalData.students.length;
    document.getElementById('stat-groups').textContent = journalData.groups.length;
    document.getElementById('stat-subjects').textContent = journalData.subjects.length;
}

function populateSelects() {
    const gSels = ['filter-group', 'student-group-select', 'filter-students-by-group'];
    const sSels = ['filter-subject', 'lesson-subject-select'];

    gSels.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = (id.includes('filter') ? '<option value="">Група...</option>' : '') + 
            journalData.groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
    });

    sSels.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = (id.includes('filter') ? '<option value="">Предмет...</option>' : '') + 
            journalData.subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    });
}

// --- АНАЛІТИКА ---
function showGroupAnalytics(groupId) {
    const group = journalData.groups.find(g => g.id == groupId);
    const students = journalData.students.filter(s => s.groupId == groupId);

    let modalHtml = `
        <div id="analytics-modal" class="modal-overlay" onclick="this.remove()">
            <div class="modal-content" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>Аналітика: ${group.name}</h3>
                    <button class="close-modal" onclick="document.getElementById('analytics-modal').remove()">×</button>
                </div>
                <div class="modal-body">
                    ${journalData.subjects.map(sub => {
                        let n5 = 0, n4 = 0, n3 = 0, n2 = 0;
                        const lessons = journalData.lessons.filter(l => l.subjectId == sub.id);
                        
                        students.forEach(st => {
                            lessons.forEach(ls => {
                                const val = parseInt(journalData.grades[`${st.id}-${ls.id}`]);
                                if (val === 5) n5++;
                                else if (val === 4) n4++;
                                else if (val === 3) n3++;
                                else if (val === 2) n2++;
                            });
                        });

                        const totalGrades = n5 + n4 + n3;
                        const totalWithFail = totalGrades + n2;
                        
                        // Розрахунок за вашими формулами
                        const avgGroup = totalGrades > 0 ? ((5*n5 + 4*n4 + 3*n3) / totalGrades).toFixed(2) : "0.00";
                        const quality = totalWithFail > 0 ? Math.round(((n5 + n4) / totalWithFail) * 100) : 0;

                        return `
                            <div class="analytics-subject-card">
                                <h4>${sub.name}</h4>
                                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                                    <span>Сер. бал: <b>${avgGroup}</b></span>
                                    <span>Якість: <b>${quality}%</b></span>
                                </div>
                                <small style="color:#666">Оцінки: 5:[${n5}], 4:[${n4}], 3:[${n3}]</small>
                            </div>`;
                    }).join('')}
                </div>
            </div>
        </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// --- ПРЕДМЕТИ ---
function renderSubjectsList() {
    document.getElementById('subjects-list').innerHTML = journalData.subjects.map(s => `
        <div class="list-item">
            <div class="item-main-info" style="cursor:pointer" onclick="showSubjectDetails(${s.id})">
                <div class="item-icon-box icon-purple"><i class="fas fa-book"></i></div>
                <div>
                    <div class="item-title">${s.name}</div>
                    <div class="item-sub">${s.hoursTotal} год. | ${s.control}</div>
                </div>
            </div>
            <div class="item-actions">
                <button class="btn-edit" onclick="editSubject(${s.id})"><i class="fas fa-edit"></i></button>
                <button class="btn-delete" onclick="deleteItem('subjects', ${s.id})"><i class="fas fa-trash"></i></button>
            </div>
        </div>`).join('') || '<div class="empty-state">Порожньо</div>';
}

function showSubjectDetails(id) {
    const s = journalData.subjects.find(x => x.id == id);
    let modalHtml = `
        <div id="details-modal" class="modal-overlay" onclick="this.remove()">
            <div class="modal-content" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>${s.name}</h3>
                    <button class="close-modal" onclick="document.getElementById('details-modal').remove()">×</button>
                </div>
                <div class="modal-body">
                    <p><b>Вид:</b> ${s.kind}</p>
                    <p><b>Кредити:</b> ${s.credits}</p>
                    <p><b>Загальна кількість годин:</b> ${s.hoursTotal}</p>
                    <p><b>Модулів:</b> ${s.modules}</p>
                    <p><b>Контроль:</b> ${s.control}</p>
                    <hr style="margin:10px 0; border:0; border-top:1px solid #eee;">
                    <p><b>Лекції:</b> ${s.hoursLectures} год.</p>
                    <p><b>Практичні:</b> ${s.hoursPract} год.</p>
                    <p><b>Сам. робота:</b> ${s.hoursSelf} год.</p>
                </div>
            </div>
        </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// --- РЕДАГУВАННЯ СТУДЕНТІВ ---
function editStudent(id) {
    const s = journalData.students.find(x => x.id == id);
    
    // Показуємо форму додавання, але міняємо її для редагування
    const form = document.getElementById('add-student-form');
    form.classList.remove('hidden');
    
    document.getElementById('student-name-input').value = s.name;
    document.getElementById('student-group-select').value = s.groupId;
    document.getElementById('student-phone-input').value = s.phone || '';
    
    // Міняємо кнопку збереження на кнопку оновлення
    const footer = form.querySelector('.form-actions');
    footer.innerHTML = `
        <button class="btn-cancel" onclick="cancelEditStudent()">Скасувати</button>
        <button class="btn-save" onclick="updateStudent(${id})">Оновити дані</button>
    `;
    form.scrollIntoView({ behavior: 'smooth' });
}

function updateStudent(id) {
    const s = journalData.students.find(x => x.id == id);
    s.name = document.getElementById('student-name-input').value.trim();
    s.groupId = document.getElementById('student-group-select').value;
    s.phone = document.getElementById('student-phone-input').value;
    
    if (!s.name || !s.groupId) return;
    
    saveToDB();
    cancelEditStudent();
    renderStudentsList();
}

function cancelEditStudent() {
    const form = document.getElementById('add-student-form');
    form.classList.add('hidden');
    form.querySelector('input').value = '';
    // Повертаємо початкову кнопку збереження
    form.querySelector('.form-actions').innerHTML = `
        <button class="btn-cancel" onclick="toggleForm('add-student-form')">Скасувати</button>
        <button class="btn-save" onclick="handleSaveStudent()">Зберегти</button>
    `;
}

// --- РЕДАГУВАННЯ ПРЕДМЕТІВ ---
function editSubject(id) {
    const s = journalData.subjects.find(x => x.id == id);
    const form = document.getElementById('add-subject-form');
    form.classList.remove('hidden');
    
    // Заповнюємо всі поля даними предмета
    document.getElementById('sub-name').value = s.name;
    document.getElementById('sub-type').value = s.type;
    document.getElementById('sub-kind').value = s.kind;
    document.getElementById('sub-credits').value = s.credits;
    document.getElementById('sub-modules').value = s.modules;
    document.getElementById('sub-hours-total').value = s.hoursTotal;
    document.getElementById('sub-hours-lectures').value = s.hoursLectures;
    document.getElementById('sub-hours-pract').value = s.hoursPract;
    document.getElementById('sub-hours-lab').value = s.hoursLab || 0;
    document.getElementById('sub-hours-sem').value = s.hoursSem || 0;
    document.getElementById('sub-hours-self').value = s.hoursSelf;
    document.getElementById('sub-control').value = s.control;
    
    const footer = form.querySelector('.form-actions');
    footer.innerHTML = `
        <button class="btn-cancel" onclick="cancelEditSubject()">Скасувати</button>
        <button class="btn-save" onclick="updateSubject(${id})">Оновити предмет</button>
    `;
    form.scrollIntoView({ behavior: 'smooth' });
}

function updateSubject(id) {
    const s = journalData.subjects.find(x => x.id == id);
    
    s.name = document.getElementById('sub-name').value.trim();
    s.type = document.getElementById('sub-type').value;
    s.kind = document.getElementById('sub-kind').value;
    s.credits = document.getElementById('sub-credits').value;
    s.modules = document.getElementById('sub-modules').value;
    s.hoursTotal = document.getElementById('sub-hours-total').value;
    s.hoursLectures = document.getElementById('sub-hours-lectures').value;
    s.hoursPract = document.getElementById('sub-hours-pract').value;
    s.hoursLab = document.getElementById('sub-hours-lab').value;
    s.hoursSem = document.getElementById('sub-hours-sem').value;
    s.hoursSelf = document.getElementById('sub-hours-self').value;
    s.control = document.getElementById('sub-control').value;
    
    saveToDB();
    cancelEditSubject();
    renderSubjectsList();
    populateSelects(); // Оновлюємо випадаючі списки, якщо назва змінилась
}

function cancelEditSubject() {
    const form = document.getElementById('add-subject-form');
    form.classList.add('hidden');
    form.querySelectorAll('input').forEach(i => i.value = '');
    form.querySelector('.form-actions').innerHTML = `
        <button class="btn-cancel" onclick="toggleForm('add-subject-form')">Скасувати</button>
        <button class="btn-save" onclick="handleAddSubject()">Зберегти предмет</button>
    `;
}

// --- РЕДАГУВАННЯ ЗАНЯТЬ ---
function editLesson(id) {
    const l = journalData.lessons.find(x => x.id == id);
    const form = document.getElementById('add-lesson-form');
    form.classList.remove('hidden');
    
    document.getElementById('lesson-subject-select').value = l.subjectId;
    document.getElementById('lesson-type-select').value = l.type;
    document.getElementById('lesson-date-input').value = l.date;
    document.getElementById('lesson-topic-input').value = l.topic;
    
    const footer = form.querySelector('.form-actions');
    footer.innerHTML = `
        <button class="btn-cancel" onclick="cancelEditLesson()">Скасувати</button>
        <button class="btn-save" onclick="updateLesson(${id})">Оновити заняття</button>
    `;
    form.scrollIntoView({ behavior: 'smooth' });
}

function updateLesson(id) {
    const l = journalData.lessons.find(x => x.id == id);
    l.subjectId = document.getElementById('lesson-subject-select').value;
    l.type = document.getElementById('lesson-type-select').value;
    l.date = document.getElementById('lesson-date-input').value;
    l.topic = document.getElementById('lesson-topic-input').value;
    
    saveToDB();
    cancelEditLesson();
    renderLessonsList();
}

function cancelEditLesson() {
    const form = document.getElementById('add-lesson-form');
    form.classList.add('hidden');
    form.querySelectorAll('input').forEach(i => i.value = '');
    form.querySelector('.form-actions').innerHTML = `
        <button class="btn-cancel" onclick="toggleForm('add-lesson-form')">Скасувати</button>
        <button class="btn-save" onclick="handleAddLesson()">Зберегти</button>
    `;
}

// --- СПИСКИ ---
function renderStudentsList() {
    const filter = document.getElementById('filter-students-by-group').value;
    const filtered = filter ? journalData.students.filter(s => s.groupId == filter) : journalData.students;
    document.getElementById('students-list').innerHTML = filtered.map(s => `
        <div class="list-item">
            <div class="item-main-info">
                <div class="item-icon-box icon-blue"><i class="fas fa-user"></i></div>
                <div><div class="item-title">${s.name}</div><div class="item-sub">${s.phone || '-'}</div></div>
            </div>
            <div class="item-actions">
                <button class="btn-edit" onclick="editStudent(${s.id})"><i class="fas fa-edit"></i></button>
                <button class="btn-delete" onclick="deleteItem('students', ${s.id})"><i class="fas fa-trash"></i></button>
            </div>
        </div>`).join('');
}

function renderLessonsList() {
    // Сортуємо копію масиву lessons за датою (від нових до старих)
    const sortedLessons = [...journalData.lessons].sort((a, b) => {
        return new Date(b.date) - new Date(a.date);
    });

    document.getElementById('lessons-list').innerHTML = sortedLessons.map(l => {
        const s = journalData.subjects.find(sub => sub.id == l.subjectId);
        return `
            <div class="list-item">
                <div class="item-main-info">
                    <div class="item-icon-box icon-green"><i class="fas fa-chalkboard"></i></div>
                    <div>
                        <div class="item-title">${s ? s.name : '?'}</div>
                        <div class="item-sub">${formatDate(l.date)} | ${l.topic} | <small>${l.type}</small></div>
                    </div>
                </div>
                <div class="item-actions">
                    <button class="btn-edit" onclick="editLesson(${l.id})"><i class="fas fa-edit"></i></button>
                    <button class="btn-delete" onclick="deleteItem('lessons', ${l.id})"><i class="fas fa-trash"></i></button>
                </div>
            </div>`;
    }).join('') || '<div class="empty-state">Занять ще не додано</div>';
}

function renderGroupsList() {
    document.getElementById('groups-list').innerHTML = journalData.groups.map(g => `
        <div class="list-item" onclick="showGroupAnalytics(${g.id})">
            <div class="item-main-info">
                <div class="item-icon-box icon-dark"><i class="fas fa-users"></i></div>
                <div class="item-title">${g.name}</div>
            </div>
            <button class="btn-delete" onclick="event.stopPropagation(); deleteItem('groups', ${g.id})"><i class="fas fa-trash"></i></button>
        </div>`).join('');
}

// --- ІНШЕ ---
// Функція для визначення класу кольору
function getGradeClass(val) {
    if (!val) return '';
    const v = val.toLowerCase();
    if (v === 'н') return 'grade-n';
    if (v === 'св') return 'grade-sv';
    
    const num = parseInt(v);
    if (isNaN(num)) return '';
    if (num >= 10 || num === 5) return 'grade-excellent'; // 10-12 або 5
    if (num >= 7 || num === 4) return 'grade-good';      // 7-9 або 4
    if (num >= 4 || num === 3) return 'grade-satisfactory'; // 4-6 або 3
    if (num < 4 || num === 2) return 'grade-poor';      // 1-3 або 2
    return '';
}

function renderJournal() {
    const wrap = document.getElementById('journal-wrapper');
    const gid = document.getElementById('filter-group').value;
    const sid = document.getElementById('filter-subject').value;
    
    if (!gid || !sid) { 
        wrap.innerHTML = '<div class="empty-state">Оберіть групу та предмет для перегляду журналу</div>'; 
        return; 
    }

    const sub = journalData.subjects.find(s => s.id == sid);
    const maxGrade = sub.type === 'subject' ? 12 : 5;
    const students = journalData.students.filter(s => s.groupId == gid);
    const lessons = journalData.lessons.filter(l => l.subjectId == sid).sort((a,b) => new Date(a.date) - new Date(b.date));

    let html = `
        <table class="journal-table">
            <thead>
                <tr>
                    <th class="th-student">Студент</th>
                    ${lessons.map(l => {
                        // Перевіряємо, чи є тип заняття контрольним
                        const isControl = l.type === "Залік з модуля" || l.type === "Тематичне оцінювання";
                        // Додаємо клас для стилізації, якщо це контроль
                        const dateClass = isControl ? 'class="date-control"' : '';
                        
                        return `<th title="${l.topic} (${l.type})" ${dateClass}>${formatDate(l.date).slice(0,5)}</th>`;
                    }).join('')}
                    <th class="th-stat" title="Пропуски">Н</th>
                    <th class="th-stat" title="Відсутнє світло">СВ</th>
                </tr>
            </thead>
            <tbody>`;

    html += students.map(st => {
        let countN = 0;
        let countSV = 0;

        const cells = lessons.map(ls => {
            const val = journalData.grades[`${st.id}-${ls.id}`] || '';
            if (val.toLowerCase() === 'н') countN++;
            if (val.toLowerCase() === 'св') countSV++;
            
            const colorClass = getGradeClass(val);
            return `<td><input type="text" class="grade-input ${colorClass}" value="${val}" onchange="saveGrade(${st.id}, ${ls.id}, this.value, ${maxGrade})"></td>`;
        }).join('');

        return `
            <tr>
                <td class="th-student">${st.name}</td>
                ${cells}
                <td class="td-stat-val text-red">${countN || ''}</td>
                <td class="td-stat-val text-orange">${countSV || ''}</td>
            </tr>`;
    }).join('');

    html += '</tbody></table>';
    wrap.innerHTML = html;
}

function saveGrade(sid, lid, val, max) {
    const cleanVal = val.toLowerCase().trim();
    // Перевірка на числові оцінки (не дозволяємо більше макс.)
    const num = parseInt(cleanVal);
    if (!isNaN(num) && num > max) {
        alert(`Максимальна оцінка для цього предмета: ${max}`);
        renderJournal(); // Скидаємо значення
        return;
    }
    
    journalData.grades[`${sid}-${lid}`] = cleanVal;
    saveToDB();
    renderJournal(); // Перемальовуємо для оновлення статистики Н/СВ та кольорів
}

function deleteItem(type, id) {
    if (confirm('Видалити?')) { journalData[type] = journalData[type].filter(x => x.id != id); saveToDB(); renderCurrentTab(); }
}

function renderCurrentTab() {
    const active = document.querySelector('.tab-content.active').id;
    if (active === 'tab-journal') renderJournal();
    if (active === 'tab-groups') renderGroupsList();
    if (active === 'tab-students') renderStudentsList();
    if (active === 'tab-subjects') renderSubjectsList();
    if (active === 'tab-lessons') renderLessonsList();
}

function toggleForm(id) { document.getElementById(id).classList.toggle('hidden'); }

function handleSaveGroup() {
    const name = document.getElementById('group-name-input').value;
    if (name) { journalData.groups.push({id: Date.now(), name}); saveToDB(); populateSelects(); renderGroupsList(); toggleForm('add-group-form'); }
}

function handleSaveStudent() {
    const name = document.getElementById('student-name-input').value;
    const gid = document.getElementById('student-group-select').value;
    if (name && gid) { journalData.students.push({id: Date.now(), name, groupId: gid}); saveToDB(); renderStudentsList(); toggleForm('add-student-form'); }
}

function handleAddSubject() {
    const name = document.getElementById('sub-name').value;
    if (name) {
        journalData.subjects.push({
            id: Date.now(), name, 
            type: document.getElementById('sub-type').value,
            kind: document.getElementById('sub-kind').value,
            credits: document.getElementById('sub-credits').value,
            modules: document.getElementById('sub-modules').value,
            hoursTotal: document.getElementById('sub-hours-total').value,
            hoursLectures: document.getElementById('sub-hours-lectures').value,
            hoursPract: document.getElementById('sub-hours-pract').value,
            hoursSelf: document.getElementById('sub-hours-self').value,
            control: document.getElementById('sub-control').value
        });
        saveToDB(); populateSelects(); renderSubjectsList(); toggleForm('add-subject-form');
    }
}

function handleAddLesson() {
    const sid = document.getElementById('lesson-subject-select').value;
    const date = document.getElementById('lesson-date-input').value;
    if (sid && date) {
        journalData.lessons.push({id: Date.now(), subjectId: sid, date, topic: document.getElementById('lesson-topic-input').value, type: document.getElementById('lesson-type-select').value});
        saveToDB(); renderLessonsList(); toggleForm('add-lesson-form');
    }
}
