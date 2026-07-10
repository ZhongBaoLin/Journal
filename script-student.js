import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, updateDoc, query, where, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ========== FIREBASE КОНФІГУРАЦІЯ ==========
const firebaseConfig = {
  apiKey: "AIzaSyCRMac4RetcPL2mvNXTJdUMcS9JZ-ZALiI",
  authDomain: "journal-tefc.firebaseapp.com",
  projectId: "journal-tefc",
  storageBucket: "journal-tefc.firebasestorage.app",
  messagingSenderId: "977017837694",
  appId: "1:977017837694:web:5f02e9ba69c384e607202f"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ========== ГЛОБАЛЬНІ ЗМІННІ ==========
let myUid = null;
let currentUserData = null;   // документ users/{uid}
let myStudentId = null;       // id документа students/{id}, який відповідає цьому користувачу
let myStudentData = null;     // дані студента (name, groupId, phone, birthDate, admissionYear, role...)
let myGroupId = null;
let myGroupData = null;       // { id, name, academicYear, course }
let pendingGroupId = null;    // група, обрана під час онбордингу (до підтвердження)
let currentTooltip = null;
const teacherNameCache = {};  // teacherId -> displayNameFull

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ========== АВТЕНТИФІКАЦІЯ ТА ЗАПУСК ==========
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "index-student.html"; return; }

  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists() || snap.data().role !== "student") {
    window.location.href = "index-student.html";
    return;
  }

  myUid = user.uid;
  currentUserData = snap.data();
  applyUserHeaderInfo();

  if (currentUserData.studentId && currentUserData.groupId) {
    const stuSnap = await getDoc(doc(db, "students", currentUserData.studentId));
    if (stuSnap.exists() && stuSnap.data().userId === myUid) {
      myStudentId = stuSnap.id;
      myStudentData = { id: stuSnap.id, ...stuSnap.data() };
      myGroupId = currentUserData.groupId;
      await initDashboard();
      return;
    }
  }

  // Профіль не завершено (перший вхід або пошкоджений зв'язок) — запускаємо онбординг
  await openGroupPickModal();
});

// ========== ОНБОРДИНГ: КРОК 1 — ВИБІР ГРУПИ ==========
async function openGroupPickModal() {
  document.getElementById("studentPickModal").classList.remove("active");
  const sel = document.getElementById("groupPickSelect");
  sel.innerHTML = '<option value="">Оберіть групу</option>';

  const groupsSnap = await getDocs(collection(db, "groups"));
  const groups = [];
  groupsSnap.forEach(d => groups.push({ id: d.id, ...d.data() }));
  groups.sort((a, b) => (a.course || '').localeCompare(b.course || '') || (a.name || '').localeCompare(b.name || ''));

  groups.forEach(g => {
    sel.innerHTML += `<option value="${g.id}">${escapeHtml(g.name)} (${g.course || '?'} курс, ${g.academicYear || '—'})</option>`;
  });

  document.getElementById("groupPickError").style.display = "none";
  document.getElementById("groupPickModal").classList.add("active");
}

window.confirmGroupPick = async function () {
  const groupId = document.getElementById("groupPickSelect").value;
  const errEl = document.getElementById("groupPickError");
  if (!groupId) {
    errEl.textContent = "Оберіть свою групу зі списку";
    errEl.style.display = "block";
    return;
  }
  errEl.style.display = "none";
  pendingGroupId = groupId;

  const groupDoc = await getDoc(doc(db, "groups", groupId));
  document.getElementById("studentPickGroupName").textContent = groupDoc.exists() ? groupDoc.data().name : "—";

  document.getElementById("groupPickModal").classList.remove("active");
  document.getElementById("studentPickModal").classList.add("active");
  await window.loadUnclaimedStudentsForPick();
};

window.backToGroupPick = function () {
  document.getElementById("studentPickModal").classList.remove("active");
  document.getElementById("groupPickModal").classList.add("active");
};

// ========== ОНБОРДИНГ: КРОК 2 — ВИБІР СЕБЕ ЗІ СПИСКУ ==========
window.loadUnclaimedStudentsForPick = async function () {
  const container = document.getElementById("studentPickList");
  container.innerHTML = '<div class="empty-state">Завантаження...</div>';
  document.getElementById("studentPickError").style.display = "none";

  const studentsSnap = await getDocs(query(collection(db, "students"), where("groupId", "==", pendingGroupId)));
  const students = [];
  studentsSnap.forEach(d => {
    const data = d.data();
    if (!data.userId) students.push({ id: d.id, ...data }); // показуємо лише незайняті записи
  });
  students.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  if (students.length === 0) {
    container.innerHTML = '<div class="empty-state">У цій групі немає вільних записів. Зверніться до викладача, щоб він додав вас до групи.</div>';
    return;
  }

  let html = '';
  students.forEach(s => {
    const safeName = escapeHtml(s.name).replace(/'/g, "\\'");
    html += `<div class="data-card pick-item" onclick="window.claimStudent('${s.id}','${safeName}')">
      <div class="data-info">
        <div class="data-icon">👨‍🎓</div>
        <div><div class="data-title">${escapeHtml(s.name)} ${s.role === 'prefect' ? '<span class="prefect-badge">Староста</span>' : ''}</div></div>
      </div>
    </div>`;
  });
  container.innerHTML = html;
};

window.claimStudent = async function (studentId, studentName) {
  const errEl = document.getElementById("studentPickError");
  errEl.style.display = "none";
  try {
    // Перевіряємо, що запис досі вільний (захист від одночасного вибору двома акаунтами)
    const freshSnap = await getDoc(doc(db, "students", studentId));
    if (!freshSnap.exists() || freshSnap.data().userId) {
      errEl.textContent = "Цей запис уже обрано іншим користувачем. Оберіть інший або оновіть список.";
      errEl.style.display = "block";
      await window.loadUnclaimedStudentsForPick();
      return;
    }

    await updateDoc(doc(db, "students", studentId), { userId: myUid });
    await updateDoc(doc(db, "users", myUid), {
      groupId: pendingGroupId,
      studentId: studentId,
      profileCompleted: true
    });

    myStudentId = studentId;
    myGroupId = pendingGroupId;
    myStudentData = { ...freshSnap.data(), id: studentId, userId: myUid };
    currentUserData = { ...currentUserData, groupId: pendingGroupId, studentId, profileCompleted: true };

    document.getElementById("studentPickModal").classList.remove("active");
    applyUserHeaderInfo();
    await initDashboard();
  } catch (e) {
    console.error(e);
    errEl.textContent = "Не вдалося зберегти вибір. Спробуйте ще раз.";
    errEl.style.display = "block";
  }
};

// ========== ІНІЦІАЛІЗАЦІЯ ОСНОВНОГО КАБІНЕТУ ==========
async function initDashboard() {
  const groupDoc = await getDoc(doc(db, "groups", myGroupId));
  myGroupData = groupDoc.exists() ? { id: groupDoc.id, ...groupDoc.data() } : { id: myGroupId, name: "—" };
  document.getElementById("groupBadgeValue").textContent = myGroupData.name;

  await populateSubjectSelect();

  if (document.getElementById("tab-progress").classList.contains("active")) {
    await loadMyProgress();
  }
}

async function populateSubjectSelect() {
  const subjectsSnap = await getDocs(query(collection(db, "subjects"), where("groupId", "==", myGroupId)));
  const subjects = [];
  subjectsSnap.forEach(s => subjects.push({ id: s.id, ...s.data() }));
  subjects.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const sel = document.getElementById("studentSubjectSelect");
  if (subjects.length === 0) {
    sel.innerHTML = '<option value="">Немає предметів</option>';
    document.getElementById("journalTableContainer").innerHTML = '<div class="empty-state">Для вашої групи ще не додано жодного предмета/дисципліни</div>';
    return;
  }

  sel.innerHTML = '<option value="">Оберіть предмет</option>' +
    subjects.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
}

document.getElementById("studentSubjectSelect").addEventListener("change", (e) => {
  renderStudentJournal(e.target.value);
});

// ========== ЖУРНАЛ (ЛИШЕ ПЕРЕГЛЯД) ==========
async function getTeacherName(teacherId) {
  if (!teacherId) return "Не вказано";
  if (teacherNameCache[teacherId]) return teacherNameCache[teacherId];
  const tDoc = await getDoc(doc(db, "users", teacherId));
  const name = tDoc.exists() ? (tDoc.data().displayNameFull || tDoc.data().displayName || "Не вказано") : "Не вказано";
  teacherNameCache[teacherId] = name;
  return name;
}

async function renderStudentJournal(subjectId) {
  const container = document.getElementById("journalTableContainer");
  const banner = document.getElementById("subjectTeacherBanner");

  if (!subjectId) {
    container.innerHTML = '<div class="empty-state">Оберіть предмет/дисципліну</div>';
    banner.style.display = "none";
    return;
  }

  container.innerHTML = '<div class="empty-state"><div class="loading-spinner"></div> Завантаження...</div>';

  const subjectDoc = await getDoc(doc(db, "subjects", subjectId));
  if (!subjectDoc.exists()) {
    container.innerHTML = '<div class="empty-state">Предмет не знайдено</div>';
    banner.style.display = "none";
    return;
  }
  const subject = subjectDoc.data();
  const subjectScale = subject.scale || '12';
  const subjectControl = subject.control || 'залік';
  const teacherName = await getTeacherName(subject.teacherId);

  banner.innerHTML = `<span class="teacher-banner-icon">👨‍🏫</span> Викладач предмета: <strong>${escapeHtml(teacherName)}</strong>`;
  banner.style.display = "flex";

  const lessonsSnap = await getDocs(query(collection(db, "lessons"), where("subjectId", "==", subjectId), where("teacherId", "==", subject.teacherId)));
  const lessons = [];
  lessonsSnap.forEach(l => lessons.push({ id: l.id, ...l.data() }));
  lessons.sort((a, b) => {
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (dateA !== dateB) return dateA - dateB;
    return (a.id || '').localeCompare(b.id || '');
  });

  if (lessons.length === 0) {
    container.innerHTML = '<div class="empty-state">Викладач ще не додав жодного заняття з цього предмета</div>';
    return;
  }

  const grades = {};
  for (const lesson of lessons) {
    const gradeSnap = await getDocs(query(collection(db, "grades"), where("lessonId", "==", lesson.id), where("studentId", "==", myStudentId)));
    if (!gradeSnap.empty) grades[lesson.id] = gradeSnap.docs[0].data().grade;
  }

  const finalSnap = await getDocs(query(collection(db, "finalGrades"), where("studentId", "==", myStudentId), where("subjectId", "==", subjectId)));
  const finalGrade = !finalSnap.empty ? finalSnap.docs[0].data().grade : '';

  let totalPoints = 0, gradeCount = 0, nCount = 0, svCount = 0;
  lessons.forEach(lesson => {
    const grade = grades[lesson.id];
    if (grade) {
      if (grade === 'н') nCount++;
      else if (grade === 'св') svCount++;
      else {
        const num = parseFloat(grade);
        if (!isNaN(num)) { totalPoints += num; gradeCount++; }
      }
    }
  });
  const avg = gradeCount > 0 ? (totalPoints / gradeCount).toFixed(1) : '-';

  let html = '<table class="journal-table"><thead><tr><th>№</th><th>Студент</th>';
  lessons.forEach(lesson => {
    const dateParts = lesson.date.split('-');
    const dateStr = `${dateParts[2]}.${dateParts[1]}.${dateParts[0].slice(-2)}`;
    let typeShort = '';
    switch (lesson.type) {
      case 'Лекція': typeShort = 'Лек.'; break;
      case 'Практичне заняття': typeShort = 'Прак.'; break;
      case 'Лабораторне заняття': typeShort = 'Лаб.'; break;
      case 'Семінарське заняття': typeShort = 'Сем.'; break;
      case 'Самостійне вивчення': typeShort = 'С.в.'; break;
      case 'Залік з модуля': typeShort = 'Залік'; break;
      case 'Тематичне оцінювання': typeShort = 'Тем.'; break;
      default: typeShort = lesson.type;
    }
    const isSpecial = (lesson.type === 'Залік з модуля' || lesson.type === 'Тематичне оцінювання');
    const specialClass = isSpecial ? 'lesson-special' : '';
    html += `<th class="date-cell ${specialClass}" data-lesson-type="${lesson.type}" data-lesson-topic="${lesson.topic || ''}" data-lesson-date="${lesson.date}">${dateStr}<br><small>${typeShort}</small></th>`;
  });

  const isExam = (subjectControl === 'екзамен');
  const finalColHeader = isExam ? 'Екзамен' : 'Підсумкова';
  html += `<th class="stat-cell">Сер.</th><th class="stat-header-red">Н</th><th class="stat-header-red">СВ</th><th class="stat-cell">${finalColHeader}</th></tr></thead><tbody>`;

  let avgClass = '';
  const avgNum = parseFloat(avg);
  if (!isNaN(avgNum)) {
    const avgRounded = Math.round(avgNum);
    if (avgRounded >= 5) avgClass = 'grade-5';
    else if (avgRounded === 4) avgClass = 'grade-4';
    else if (avgRounded === 3) avgClass = 'grade-3';
    else if (avgRounded === 2) avgClass = 'grade-2';
    else if (avgRounded <= 1) avgClass = 'grade-1';
  }

  let finalGradeClass = '';
  const finalNum = parseFloat(finalGrade);
  if (!isNaN(finalNum)) {
    const finalRounded = Math.round(finalNum);
    if (finalRounded >= 5) finalGradeClass = 'grade-5';
    else if (finalRounded === 4) finalGradeClass = 'grade-4';
    else if (finalRounded === 3) finalGradeClass = 'grade-3';
    else if (finalRounded === 2) finalGradeClass = 'grade-2';
    else if (finalRounded <= 1) finalGradeClass = 'grade-1';
  }

  html += `<tr><td style="text-align:center; width:40px;">1</td><td style="text-align:left"><strong>${escapeHtml(myStudentData.name)}</strong></td>`;
  lessons.forEach(lesson => {
    const grade = grades[lesson.id] || '';
    let gradeClass = '';
    if (grade === 'н') gradeClass = 'grade-n';
    else if (grade === 'св') gradeClass = 'grade-sv';
    else {
      const num = parseFloat(grade);
      if (num === 5) gradeClass = 'grade-5';
      else if (num === 4) gradeClass = 'grade-4';
      else if (num === 3) gradeClass = 'grade-3';
      else if (num === 2) gradeClass = 'grade-2';
      else if (num === 1) gradeClass = 'grade-1';
    }
    html += `<td class="grade-cell ${gradeClass}" data-lesson-id="${lesson.id}">${grade || '—'}</td>`;
  });

  let nClass = nCount > 0 ? 'cell-h-active' : 'stat-cell-red-text';
  let svClass = svCount > 0 ? 'cell-sv-active' : 'stat-cell-red-text';
  html += `<td class="stat-cell ${avgClass}" style="font-weight:700;">${avg}</td>
           <td class="${nClass}">${nCount}</td>
           <td class="${svClass}">${svCount}</td>
           <td class="final-grade-cell ${finalGradeClass}">${finalGrade || '—'}</td>`;
  html += '</tr></tbody></table>';

  container.innerHTML = html;

  // Підказки з темою заняття: наведення (десктоп) та тап (планшети/телефони)
  document.querySelectorAll('.date-cell').forEach(cell => {
    cell.addEventListener('mouseenter', showTooltip);
    cell.addEventListener('mouseleave', hideTooltip);
    cell.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      if (currentTooltip && currentTooltip.dataset.forCell === cell.dataset.lessonDate + cell.dataset.lessonTopic) {
        hideTooltip();
        return;
      }
      showTooltip(e);
      if (currentTooltip) currentTooltip.dataset.forCell = cell.dataset.lessonDate + cell.dataset.lessonTopic;
    }, { passive: true });
  });
}

document.addEventListener('touchstart', (e) => {
  if (!e.target.closest('.date-cell')) hideTooltip();
}, { passive: true });

function showTooltip(e) {
  if (currentTooltip) { currentTooltip.remove(); currentTooltip = null; }
  const cell = e.target.closest('.date-cell');
  if (!cell) return;
  let lessonType = cell.dataset.lessonType;
  const lessonTopic = cell.dataset.lessonTopic;
  const lessonDate = cell.dataset.lessonDate;
  if (lessonType === 'Практичне') lessonType = 'Практичне заняття';
  if (lessonType === 'Лабораторне') lessonType = 'Лабораторне заняття';
  if (lessonType === 'Семінарське') lessonType = 'Семінарське заняття';
  const dateParts = lessonDate.split('-');
  const formattedDate = `${dateParts[2]}.${dateParts[1]}.${dateParts[0]}`;
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  tooltip.innerHTML = `<strong>${formattedDate}</strong><br>${lessonType}<br>${lessonTopic || 'Без теми'}`;
  document.body.appendChild(tooltip);
  const rect = cell.getBoundingClientRect();
  let left = rect.left;
  let top = rect.top - tooltip.offsetHeight - 5;
  if (top < 0) top = rect.bottom + 5;
  if (left + tooltip.offsetWidth > window.innerWidth) left = window.innerWidth - tooltip.offsetWidth - 10;
  if (left < 0) left = 10;
  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
  currentTooltip = tooltip;
}

function hideTooltip() {
  if (currentTooltip) { currentTooltip.remove(); currentTooltip = null; }
}

// ========== МОЯ УСПІШНІСТЬ (СТАТИСТИКА ПО ВСІХ ПРЕДМЕТАХ) ==========
async function loadMyProgress() {
  const container = document.getElementById("progressList");
  container.innerHTML = '<div class="empty-state"><div class="loading-spinner"></div> Завантаження...</div>';

  const subjectsSnap = await getDocs(query(collection(db, "subjects"), where("groupId", "==", myGroupId)));
  const subjects = [];
  subjectsSnap.forEach(s => subjects.push({ id: s.id, ...s.data() }));
  subjects.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  if (subjects.length === 0) {
    container.innerHTML = '<div class="empty-state">Для вашої групи ще немає предметів/дисциплін</div>';
    return;
  }

  const rows = [];
  for (const subject of subjects) {
    const teacherName = await getTeacherName(subject.teacherId);
    const finalSnap = await getDocs(query(collection(db, "finalGrades"), where("studentId", "==", myStudentId), where("subjectId", "==", subject.id)));
    let gradeText = '—';
    let label = 'Поточна оцінка (середній бал)';

    if (!finalSnap.empty && finalSnap.docs[0].data().grade) {
      gradeText = finalSnap.docs[0].data().grade;
      label = (subject.control === 'екзамен') ? 'Оцінка за екзамен' : 'Підсумкова оцінка';
    } else {
      const lessonsSnap = await getDocs(query(collection(db, "lessons"), where("subjectId", "==", subject.id), where("teacherId", "==", subject.teacherId)));
      let total = 0, count = 0;
      for (const lessonDoc of lessonsSnap.docs) {
        const gradeSnap = await getDocs(query(collection(db, "grades"), where("lessonId", "==", lessonDoc.id), where("studentId", "==", myStudentId)));
        if (!gradeSnap.empty) {
          const num = parseFloat(gradeSnap.docs[0].data().grade);
          if (!isNaN(num)) { total += num; count++; }
        }
      }
      gradeText = count > 0 ? (total / count).toFixed(1) : '—';
    }

    rows.push(`<div class="stat-item"><div class="stat-label">${escapeHtml(subject.name)} — ${label}<br><span style="opacity:.75;">Викладач: ${escapeHtml(teacherName)}</span></div><div class="stat-value">${gradeText}</div></div>`);
  }
  container.innerHTML = rows.join('');
}

// ========== ВКЛАДКИ ==========
window.switchTab = function (tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  document.querySelector(`.tab-btn[onclick*="${tabId}"]`)?.classList.add('active');

  if (tabId === 'tab-progress' && myGroupId) {
    loadMyProgress();
  }
};

// ========== ХЕДЕР КОРИСТУВАЧА ==========
function applyUserHeaderInfo() {
  if (!currentUserData) return;
  const fullName = (myStudentData && myStudentData.name) || currentUserData.displayName || "Студент";
  const avatarUrl = currentUserData.photoURL || ("https://ui-avatars.com/api/?name=" + encodeURIComponent(fullName));
  document.getElementById("userName").textContent = fullName;
  document.getElementById("userAvatar").src = avatarUrl;
  document.getElementById("burgerAvatar").src = avatarUrl;
  document.getElementById("burgerName").textContent = fullName;
  document.getElementById("burgerEmail").textContent = currentUserData.email || '';
}

// ========== БУРГЕР-МЕНЮ ==========
window.toggleBurgerMenu = function (e) {
  if (e) e.stopPropagation();
  document.getElementById("burgerMenu").classList.toggle("open");
};

document.addEventListener('click', function (e) {
  const burger = document.getElementById('burgerMenu');
  const avatarBtn = document.getElementById('avatarBtn');
  if (burger && burger.classList.contains('open')) {
    if (!burger.contains(e.target) && e.target !== avatarBtn && !avatarBtn.contains(e.target)) {
      burger.classList.remove('open');
    }
  }
});

// ========== МОДАЛЬНЕ ВІКНО "МОЯ ІНФОРМАЦІЯ" ==========
function populateAdmissionYearSelect() {
  const sel = document.getElementById("piAdmissionYear");
  const nowYear = new Date().getFullYear();
  let html = '<option value="">Оберіть рік</option>';
  for (let y = nowYear + 1; y >= nowYear - 15; y--) {
    html += `<option value="${y}">${y}</option>`;
  }
  sel.innerHTML = html;
}

window.openPersonalInfoModal = function () {
  document.getElementById("burgerMenu").classList.remove("open");
  if (!myStudentData) return;
  populateAdmissionYearSelect();

  document.getElementById("piName").textContent = myStudentData.name || "—";
  document.getElementById("piEmail").textContent = currentUserData.email || "";
  document.getElementById("piGroupName").textContent = (myGroupData && myGroupData.name) || "—";
  document.getElementById("piBirthDate").value = myStudentData.birthDate || "";
  document.getElementById("piPhone").value = myStudentData.phone || "";
  const admissionEl = document.getElementById("piAdmissionYear");
  if (myStudentData.admissionYear && admissionEl.querySelector(`option[value="${myStudentData.admissionYear}"]`)) {
    admissionEl.value = myStudentData.admissionYear;
  }
  document.getElementById("piAvatarPreview").src = currentUserData.photoURL || ("https://ui-avatars.com/api/?name=" + encodeURIComponent(myStudentData.name || "Студент"));
  document.getElementById("piError").style.display = "none";
  document.getElementById("personalInfoModal").classList.add("active");
};

window.closePersonalInfoModal = function () {
  document.getElementById("personalInfoModal").classList.remove("active");
};

window.savePersonalInfo = async function () {
  const birthDate = document.getElementById("piBirthDate").value;
  const phone = document.getElementById("piPhone").value.trim();
  const admissionYear = document.getElementById("piAdmissionYear").value;
  const errEl = document.getElementById("piError");
  errEl.style.display = "none";

  const btn = document.getElementById("piSaveBtn");
  btn.disabled = true;
  const prevText = btn.textContent;
  btn.textContent = "Збереження...";

  try {
    const data = {
      birthDate: birthDate || null,
      phone: phone || null,
      admissionYear: admissionYear ? parseInt(admissionYear) : null
    };
    await updateDoc(doc(db, "students", myStudentId), data);
    myStudentData = { ...myStudentData, ...data };
    window.closePersonalInfoModal();
  } catch (e) {
    console.error(e);
    errEl.textContent = "Не вдалося зберегти зміни. Спробуйте ще раз.";
    errEl.style.display = "block";
  } finally {
    btn.disabled = false;
    btn.textContent = prevText;
  }
};

// ========== ВИХІД ==========
window.logout = async () => {
  await signOut(auth);
  window.location.href = "index-student.html";
};
