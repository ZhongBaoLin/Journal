import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// --- КОНФІГУРАЦІЯ FIREBASE ---
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
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// --- ГЛОБАЛЬНІ ЗМІННІ ---
let currentUser = null;
let journalData = {
    groups: [],
    subjects: [],
    students: [],
    lessons: [],
    grades: {}
};

// --- АВТОРИЗАЦІЯ ТА СИНХРОНІЗАЦІЯ ---

onAuthStateChanged(auth, (user) => {
    const authScreen = document.getElementById('auth-screen');
    const appContent = document.getElementById('app-content');

    if (user) {
        currentUser = user;
        if (authScreen) authScreen.style.display = 'none';
        if (appContent) appContent.style.display = 'block';

        // Реальний час: підписка на документ конкретного користувача
        onSnapshot(doc(db, "users", user.uid), (snapshot) => {
            if (snapshot.exists()) {
                journalData = snapshot.data();
                refreshUI();
            } else {
                saveToDB(); // Створення бази для нового користувача
            }
        });
    } else {
        currentUser = null;
        if (authScreen) authScreen.style.display = 'flex';
        if (appContent) appContent.style.display = 'none';
    }
});

window.handleLogin = () => signInWithPopup(auth, provider).catch(console.error);
window.handleLogout = () => signOut(auth).catch(console.error);

window.handleLogin = handleLogin;

async function saveToDB() {
    if (!currentUser) return;
    updateGlobalStats();
    try {
        await setDoc(doc(db, "users", currentUser.uid), journalData);
    } catch (e) {
        console.error("Помилка Firebase:", e);
    }
}

function refreshUI() {
    updateGlobalStats();
    populateSelects();
    renderCurrentTab();
}

// --- ЕКСПОРТ ФУНКЦІЙ ДЛЯ HTML ---

window.toggleForm = (id) => document.getElementById(id).classList.toggle('hidden');
window.handleSaveGroup = handleSaveGroup;
window.handleSaveStudent = handleSaveStudent;
window.handleAddSubject = handleAddSubject;
window.handleAddLesson = handleAddLesson;
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

// --- СЛУХАЧІ ПОДІЙ ---

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    const loginBtn = document.getElementById('btn-google-login');
    if (loginBtn) loginBtn.onclick = window.handleLogin;

    const fGroup = document.getElementById('filter-group');
    const fSub = document.getElementById('filter-subject');
    if (fGroup) fGroup.addEventListener('change', renderJournal);
    if (fSub) fSub.addEventListener('change', renderJournal);
    
    const fStGroup = document.getElementById('filter-students-by-group');
    if (fStGroup) fStGroup.addEventListener('change', renderStudentsList);
});

// --- ДОПОМІЖНІ ФУНКЦІЇ ---

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
            const target = document.getElementById(btn.dataset.target);
            if (target) target.classList.add('active');
            renderCurrentTab();
        });
    });
}

function updateGlobalStats() {
    const s = document.getElementById('stat-students');
    const g = document.getElementById('stat-groups');
    const sub = document.getElementById('stat-subjects');
    if (s) s.textContent = journalData.students.length;
    if (g) g.textContent = journalData.groups.length;
    if (sub) sub.textContent = journalData.subjects.length;
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

function getGradeClass(val) {
    if (!val) return '';
    const v = val.toLowerCase();
    if (v === 'н') return 'grade-n';
    if (v === 'св') return 'grade-sv';
    const num = parseInt(v);
    if (isNaN(num)) return '';
    if (num >= 10 || num === 5) return 'grade-excellent';
    if (num >= 7 || num === 4) return 'grade-good';
    if (num >= 4 || num === 3) return 'grade-satisfactory';
    return 'grade-poor';
}

// --- РЕНДЕР ТАБЛИЦЬ ТА СПИСКІВ ---

function renderCurrentTab() {
    const activeContent = document.querySelector('.tab-content.active');
    if (!activeContent) return;
    const activeId = activeContent.id;
    if (activeId === 'tab-journal') renderJournal();
    if (activeId === 'tab-groups') renderGroupsList();
    if (activeId === 'tab-students') renderStudentsList();
    if (activeId === 'tab-subjects') renderSubjectsList();
    if (activeId === 'tab-lessons') renderLessonsList();
}

function renderJournal() {
    const wrap = document.getElementById('journal-wrapper');
    const gid = document.getElementById('filter-group').value;
    const sid = document.getElementById('filter-subject').value;
    
    if (!gid || !sid || !wrap) { 
        if(wrap) wrap.innerHTML = '<div class="empty-state">Оберіть групу та предмет для перегляду журналу</div>'; 
        return; 
    }

    const sub = journalData.subjects.find(s => s.id == sid);
    const maxGrade = (sub && sub.type === 'subject') ? 12 : 5;
    const students = journalData.students.filter(s => s.groupId == gid);
    const lessons = journalData.lessons.filter(l => l.subjectId == sid).sort((a,b) => new Date(a.date) - new Date(b.date));

    let html = `<table class="journal-table"><thead><tr><th class="th-student">Студент</th>`;
    html += lessons.map(l => {
        const isControl = l.type === "Залік з модуля" || l.type === "Тематичне оцінювання";
        return `<th title="${l.topic} (${l.type})" ${isControl ? 'class="date-control"' : ''}>${formatDate(l.date).slice(0,5)}</th>`;
    }).join('');
    html += `<th class="th-stat">Н</th><th class="th-stat">СВ</th></tr></thead><tbody>`;

    html += students.map(st => {
        let n = 0, sv = 0;
        const cells = lessons.map(ls => {
            const val = journalData.grades[`${st.id}-${ls.id}`] || '';
            if (val.toLowerCase() === 'н') n++;
            if (val.toLowerCase() === 'св') sv++;
            return `<td><input type="text" class="grade-input ${getGradeClass(val)}" value="${val}" onchange="window.saveGrade(${st.id}, ${ls.id}, this.value, ${maxGrade})"></td>`;
        }).join('');
        return `<tr><td class="th-student">${st.name}</td>${cells}<td class="text-red">${n || ''}</td><td class="text-orange">${sv || ''}</td></tr>`;
    }).join('');

    wrap.innerHTML = html + '</tbody></table>';
}

function renderGroupsList() {
    const list = document.getElementById('groups-list');
    if (!list) return;
    list.innerHTML = journalData.groups.map(g => `
        <div class="list-item" onclick="window.showGroupAnalytics(${g.id})">
            <div class="item-main-info">
                <div class="item-icon-box icon-dark"><i class="fas fa-users"></i></div>
                <div class="item-title">${g.name}</div>
            </div>
            <button class="btn-delete" onclick="event.stopPropagation(); window.deleteItem('groups', ${g.id})"><i class="fas fa-trash"></i></button>
        </div>`).join('');
}

function renderStudentsList() {
    const filter = document.getElementById('filter-students-by-group').value;
    const filtered = filter ? journalData.students.filter(s => s.groupId == filter) : journalData.students;
    const list = document.getElementById('students-list');
    if (!list) return;
    list.innerHTML = filtered.map(s => `
        <div class="list-item">
            <div class="item-main-info">
                <div class="item-icon-box icon-blue"><i class="fas fa-user"></i></div>
                <div><div class="item-title">${s.name}</div><div class="item-sub">${s.phone || '-'}</div></div>
            </div>
            <div class="item-actions">
                <button class="btn-edit" onclick="window.editStudent(${s.id})"><i class="fas fa-edit"></i></button>
                <button class="btn-delete" onclick="window.deleteItem('students', ${s.id})"><i class="fas fa-trash"></i></button>
            </div>
        </div>`).join('');
}

function renderSubjectsList() {
    const list = document.getElementById('subjects-list');
    if (!list) return;
    list.innerHTML = journalData.subjects.map(s => `
        <div class="list-item">
            <div class="item-main-info" style="cursor:pointer" onclick="window.showSubjectDetails(${s.id})">
                <div class="item-icon-box icon-purple"><i class="fas fa-book"></i></div>
                <div>
                    <div class="item-title">${s.name}</div>
                    <div class="item-sub">${s.hoursTotal} год. | ${s.control}</div>
                </div>
            </div>
            <div class="item-actions">
                <button class="btn-edit" onclick="window.editSubject(${s.id})"><i class="fas fa-edit"></i></button>
                <button class="btn-delete" onclick="window.deleteItem('subjects', ${s.id})"><i class="fas fa-trash"></i></button>
            </div>
        </div>`).join('') || '<div class="empty-state">Порожньо</div>';
}

function renderLessonsList() {
    const sorted = [...journalData.lessons].sort((a, b) => new Date(b.date) - new Date(a.date));
    const list = document.getElementById('lessons-list');
    if (!list) return;
    list.innerHTML = sorted.map(l => {
        const s = journalData.subjects.find(sub => sub.id == l.subjectId);
        return `<div class="list-item">
            <div class="item-main-info">
                <div class="item-icon-box icon-green"><i class="fas fa-chalkboard"></i></div>
                <div><div class="item-title">${s ? s.name : '?'}</div><div class="item-sub">${formatDate(l.date)} | ${l.topic} | <small>${l.type}</small></div></div>
            </div>
            <div class="item-actions">
                <button class="btn-edit" onclick="window.editLesson(${l.id})"><i class="fas fa-edit"></i></button>
                <button class="btn-delete" onclick="window.deleteItem('lessons', ${l.id})"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    }).join('') || '<div class="empty-state">Занять ще не додано</div>';
}

// --- МОДАЛЬНІ ВІКНА ---

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
                    <p><b>Вид:</b> ${s.kind}</p><p><b>Кредити:</b> ${s.credits}</p>
                    <p><b>Загальна кількість годин:</b> ${s.hoursTotal}</p><p><b>Модулів:</b> ${s.modules}</p>
                    <p><b>Контроль:</b> ${s.control}</p><hr style="margin:10px 0; border:0; border-top:1px solid #eee;">
                    <p><b>Лекції:</b> ${s.hoursLectures} год.</p><p><b>Практичні:</b> ${s.hoursPract} год.</p>
                    <p><b>Сам. робота:</b> ${s.hoursSelf} год.</p>
                </div>
            </div>
        </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

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
                                if (val === 5) n5++; else if (val === 4) n4++; else if (val === 3) n3++; else if (val === 2) n2++;
                            });
                        });
                        const totalGrades = n5 + n4 + n3;
                        const totalWithFail = totalGrades + n2;
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

// --- ФУНКЦІЇ ЗБЕРЕЖЕННЯ ---

function handleSaveGroup() {
    const name = document.getElementById('group-name-input').value;
    if (name) { 
        journalData.groups.push({id: Date.now(), name}); 
        saveToDB(); 
        document.getElementById('group-name-input').value = '';
        window.toggleForm('add-group-form'); 
    }
}

function handleSaveStudent() {
    const name = document.getElementById('student-name-input').value;
    const gid = document.getElementById('student-group-select').value;
    if (name && gid) { 
        journalData.students.push({
            id: Date.now(), 
            name, 
            groupId: gid, 
            phone: document.getElementById('student-phone-input').value 
        }); 
        saveToDB(); 
        window.toggleForm('add-student-form'); 
    }
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
            hoursLab: document.getElementById('sub-hours-lab').value,
            hoursSem: document.getElementById('sub-hours-sem').value,
            hoursSelf: document.getElementById('sub-hours-self').value,
            control: document.getElementById('sub-control').value
        });
        saveToDB(); window.toggleForm('add-subject-form');
    }
}

function handleAddLesson() {
    const sid = document.getElementById('lesson-subject-select').value;
    const date = document.getElementById('lesson-date-input').value;
    if (sid && date) {
        journalData.lessons.push({
            id: Date.now(), 
            subjectId: sid, 
            date, 
            topic: document.getElementById('lesson-topic-input').value, 
            type: document.getElementById('lesson-type-select').value
        });
        saveToDB(); window.toggleForm('add-lesson-form');
    }
}

function saveGrade(sid, lid, val, max) {
    const cleanVal = val.toLowerCase().trim();
    const num = parseInt(cleanVal);
    if (!isNaN(num) && num > max) { 
        alert(`Максимальна оцінка для цього предмета: ${max}`); 
        renderJournal(); 
        return; 
    }
    journalData.grades[`${sid}-${lid}`] = cleanVal;
    saveToDB();
    renderJournal();
}

// --- ВИДАЛЕННЯ ТА РЕДАГУВАННЯ ---

function deleteItem(type, id) {
    if (confirm('Видалити цей елемент?')) { 
        journalData[type] = journalData[type].filter(x => x.id != id); 
        saveToDB(); 
    }
}

// СТУДЕНТИ
function editStudent(id) {
    const s = journalData.students.find(x => x.id == id);
    window.toggleForm('add-student-form');
    document.getElementById('student-name-input').value = s.name;
    document.getElementById('student-group-select').value = s.groupId;
    document.getElementById('student-phone-input').value = s.phone || '';
    const footer = document.querySelector('#add-student-form .form-actions');
    footer.innerHTML = `<button class="btn-cancel" onclick="window.cancelEditStudent()">Скасувати</button>
                        <button class="btn-save" onclick="window.updateStudent(${id})">Оновити дані</button>`;
}

window.updateStudent = (id) => {
    const s = journalData.students.find(x => x.id == id);
    s.name = document.getElementById('student-name-input').value;
    s.groupId = document.getElementById('student-group-select').value;
    s.phone = document.getElementById('student-phone-input').value;
    saveToDB(); window.cancelEditStudent();
};

function cancelEditStudent() {
    const form = document.getElementById('add-student-form');
    form.classList.add('hidden');
    form.querySelectorAll('input').forEach(i => i.value = '');
    form.querySelector('.form-actions').innerHTML = 
        `<button class="btn-cancel" onclick="window.toggleForm('add-student-form')">Скасувати</button>
         <button class="btn-save" onclick="window.handleSaveStudent()">Зберегти</button>`;
}

// ПРЕДМЕТИ
function editSubject(id) {
    const s = journalData.subjects.find(x => x.id == id);
    window.toggleForm('add-subject-form');
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
    const footer = document.querySelector('#add-subject-form .form-actions');
    footer.innerHTML = `<button class="btn-cancel" onclick="window.cancelEditSubject()">Скасувати</button>
                        <button class="btn-save" onclick="window.updateSubject(${id})">Оновити предмет</button>`;
}

window.updateSubject = (id) => {
    const s = journalData.subjects.find(x => x.id == id);
    s.name = document.getElementById('sub-name').value;
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
    saveToDB(); window.cancelEditSubject();
};

function cancelEditSubject() {
    const form = document.getElementById('add-subject-form');
    form.classList.add('hidden');
    form.querySelectorAll('input').forEach(i => i.value = '');
    form.querySelector('.form-actions').innerHTML = 
        `<button class="btn-cancel" onclick="window.toggleForm('add-subject-form')">Скасувати</button>
         <button class="btn-save" onclick="window.handleAddSubject()">Зберегти предмет</button>`;
}

// ЗАНЯТТЯ
function editLesson(id) {
    const l = journalData.lessons.find(x => x.id == id);
    window.toggleForm('add-lesson-form');
    document.getElementById('lesson-subject-select').value = l.subjectId;
    document.getElementById('lesson-type-select').value = l.type;
    document.getElementById('lesson-date-input').value = l.date;
    document.getElementById('lesson-topic-input').value = l.topic;
    const footer = document.querySelector('#add-lesson-form .form-actions');
    footer.innerHTML = `<button class="btn-cancel" onclick="window.cancelEditLesson()">Скасувати</button>
                        <button class="btn-save" onclick="window.updateLesson(${id})">Оновити заняття</button>`;
}

window.updateLesson = (id) => {
    const l = journalData.lessons.find(x => x.id == id);
    l.subjectId = document.getElementById('lesson-subject-select').value;
    l.type = document.getElementById('lesson-type-select').value;
    l.date = document.getElementById('lesson-date-input').value;
    l.topic = document.getElementById('lesson-topic-input').value;
    saveToDB(); window.cancelEditLesson();
};

function cancelEditLesson() {
    const form = document.getElementById('add-lesson-form');
    form.classList.add('hidden');
    form.querySelectorAll('input').forEach(i => i.value = '');
    form.querySelector('.form-actions').innerHTML = 
        `<button class="btn-cancel" onclick="window.toggleForm('add-lesson-form')">Скасувати</button>
         <button class="btn-save" onclick="window.handleAddLesson()">Зберегти</button>`;
}
