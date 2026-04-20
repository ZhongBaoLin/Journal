  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
  import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
  import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, where, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
  let currentEditId = null;
  let currentTeacherId = null;
  let currentTooltip = null;
  let currentEditingCell = null;
  let currentActiveInput = null;
  let currentGroupId = null;
  let currentSubjectId = null;

  // Ключі для збереження стану в sessionStorage
  const STORAGE_KEYS = {
    lastYear: 'journal_last_year',
    lastGroup: 'journal_last_group',
    lastSubject: 'journal_last_subject',
    lastStudentGroup: 'student_last_group',
    lastLessonFilter: 'lesson_filter_subject',
    activeTab: 'active_tab'
  };

  // ========== НЕГАЙНЕ ВІДНОВЛЕННЯ ВКЛАДКИ ДО ЗАВАНТАЖЕННЯ ДАНИХ ==========
  // Виконується синхронно, щоб уникнути миготіння при оновленні сторінки
  (function immediateTabRestore() {
    const savedTab = sessionStorage.getItem(STORAGE_KEYS.activeTab);
    if (savedTab && document.getElementById(savedTab)) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
      document.getElementById(savedTab).classList.add('active');
      const buttons = document.querySelectorAll('.tab-btn');
      const tabMap = {
        'tab-journal': 0, 'tab-lessons': 1, 'tab-groups': 2, 'tab-students': 3, 'tab-subjects': 4
      };
      if (tabMap[savedTab] !== undefined && buttons[tabMap[savedTab]]) {
        buttons[tabMap[savedTab]].classList.add('active');
      }
    }
  })();

  // ========== ФУНКЦІЇ ДЛЯ РОБОТИ З СХОВИЩЕМ СТАНУ ==========
  function saveActiveTab(tabId) {
    sessionStorage.setItem(STORAGE_KEYS.activeTab, tabId);
  }

  // Негайне відновлення вкладки (без setTimeout) для уникнення миготіння
  function applyActiveTab(tabId) {
    if (!tabId || !document.getElementById(tabId)) return;
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    const buttons = document.querySelectorAll('.tab-btn');
    const tabMap = {
      'tab-journal': 0, 'tab-lessons': 1, 'tab-groups': 2, 'tab-students': 3, 'tab-subjects': 4
    };
    if (tabMap[tabId] !== undefined && buttons[tabMap[tabId]]) {
      buttons[tabMap[tabId]].classList.add('active');
    }
  }

  function restoreActiveTab() {
    const savedTab = sessionStorage.getItem(STORAGE_KEYS.activeTab);
    if (savedTab) applyActiveTab(savedTab);
    return savedTab;
  }

  function saveLastSelection() {
    const year = document.getElementById("journalYearSelect")?.value;
    const groupId = document.getElementById("journalGroupSelect")?.value;
    const subjectId = document.getElementById("journalSubjectSelect")?.value;
    const lessonFilter = document.getElementById("lessonFilterSubject")?.value;
    
    if (year && year !== "Оберіть рік") sessionStorage.setItem(STORAGE_KEYS.lastYear, year);
    if (groupId && groupId !== "Оберіть групу") sessionStorage.setItem(STORAGE_KEYS.lastGroup, groupId);
    if (subjectId && subjectId !== "Оберіть предмет") sessionStorage.setItem(STORAGE_KEYS.lastSubject, subjectId);
    if (lessonFilter) sessionStorage.setItem(STORAGE_KEYS.lastLessonFilter, lessonFilter);
  }

  function restoreLastSelection() {
    const lastYear = sessionStorage.getItem(STORAGE_KEYS.lastYear);
    const lastGroup = sessionStorage.getItem(STORAGE_KEYS.lastGroup);
    const lastSubject = sessionStorage.getItem(STORAGE_KEYS.lastSubject);
    const lastLessonFilter = sessionStorage.getItem(STORAGE_KEYS.lastLessonFilter);
    
    if (lastYear && document.querySelector(`#journalYearSelect option[value="${lastYear}"]`)) {
      document.getElementById("journalYearSelect").value = lastYear;
    }
    if (lastGroup && document.querySelector(`#journalGroupSelect option[value="${lastGroup}"]`)) {
      document.getElementById("journalGroupSelect").value = lastGroup;
    }
    if (lastSubject && document.querySelector(`#journalSubjectSelect option[value="${lastSubject}"]`)) {
      document.getElementById("journalSubjectSelect").value = lastSubject;
    }
    if (lastLessonFilter && document.querySelector(`#lessonFilterSubject option[value="${lastLessonFilter}"]`)) {
      document.getElementById("lessonFilterSubject").value = lastLessonFilter;
    }
  }

  // ========== ДОПОМІЖНІ ФУНКЦІЇ ==========
  function safeRemoveInput(input, cell) {
    if (input && input.parentNode === cell) {
      try { cell.removeChild(input); } catch(e) { console.warn('Error removing input:', e); }
    }
  }

  function validateGrade(grade, scale) {
    if (grade === 'н' || grade === 'св') return grade;
    const num = parseFloat(grade);
    if (isNaN(num)) return null;
    if (scale === '12' && num >= 1 && num <= 12 && Number.isInteger(num)) return num.toString();
    if (scale === '5' && num >= 1 && num <= 5 && Number.isInteger(num)) return num.toString();
    return null;
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ========== ФУНКЦІЇ ДЛЯ РОБОТИ З ОЦІНКАМИ ==========
  async function saveGradeDirect(lessonId, studentId, newGrade, scale) {
    if (newGrade === '') {
      const q = query(collection(db, "grades"), where("lessonId", "==", lessonId), where("studentId", "==", studentId));
      const existing = await getDocs(q);
      if (!existing.empty) await deleteDoc(doc(db, "grades", existing.docs[0].id));
      return;
    }
    const validatedGrade = validateGrade(newGrade, scale);
    if (validatedGrade === null) {
      alert(`Невірна оцінка! Дозволені: 1-${scale} або "н", "св"`);
      return;
    }
    const q = query(collection(db, "grades"), where("lessonId", "==", lessonId), where("studentId", "==", studentId));
    const existing = await getDocs(q);
    const gradeData = { lessonId, studentId, grade: validatedGrade, updatedAt: new Date().toISOString() };
    if (existing.empty) await addDoc(collection(db, "grades"), gradeData);
    else await updateDoc(doc(db, "grades", existing.docs[0].id), gradeData);
  }

  async function saveFinalGradeDirect(studentId, subjectId, newGrade, scale) {
    if (newGrade === '') {
      const q = query(collection(db, "finalGrades"), where("studentId", "==", studentId), where("subjectId", "==", subjectId));
      const existing = await getDocs(q);
      if (!existing.empty) await deleteDoc(doc(db, "finalGrades", existing.docs[0].id));
      return;
    }
    const validatedGrade = validateGrade(newGrade, scale);
    if (validatedGrade === null) {
      alert(`Невірна оцінка! Дозволені: 1-${scale}`);
      return;
    }
    const q = query(collection(db, "finalGrades"), where("studentId", "==", studentId), where("subjectId", "==", subjectId));
    const existing = await getDocs(q);
    const gradeData = { studentId, subjectId, grade: validatedGrade, updatedAt: new Date().toISOString() };
    if (existing.empty) await addDoc(collection(db, "finalGrades"), gradeData);
    else await updateDoc(doc(db, "finalGrades", existing.docs[0].id), gradeData);
  }

  // ========== ФУНКЦІЇ ОНОВЛЕННЯ ВІДОБРАЖЕННЯ ==========
  function updateGradeCellDisplay(cell, grade, scale) {
    if (!cell) return;
    cell.dataset.currentGrade = grade || '';
    let displayGrade = grade || '—';
    let gradeClass = '';
    if (grade === 'н') { gradeClass = 'grade-n'; displayGrade = 'н'; }
    else if (grade === 'св') { gradeClass = 'grade-sv'; displayGrade = 'св'; }
    else {
      const num = parseFloat(grade);
      if (num === 5) gradeClass = 'grade-5';
      else if (num === 4) gradeClass = 'grade-4';
      else if (num === 3) gradeClass = 'grade-3';
      else if (num === 2) gradeClass = 'grade-2';
      else if (num === 1) gradeClass = 'grade-1';
      displayGrade = grade || '—';
    }
    const lessonId = cell.dataset.lessonId, studentId = cell.dataset.studentId, currentScale = cell.dataset.scale;
    cell.className = `grade-cell ${gradeClass}`;
    cell.textContent = displayGrade;
    cell.setAttribute('data-current-grade', grade || '');
    if (lessonId) cell.setAttribute('data-lesson-id', lessonId);
    if (studentId) cell.setAttribute('data-student-id', studentId);
    if (currentScale) cell.setAttribute('data-scale', currentScale);
    cell.onclick = function() { startEditGrade(cell); };
    updateStudentStats(cell.dataset.studentId);
  }

  function updateFinalGradeCellDisplay(cell, grade, scale) {
    if (!cell) return;
    cell.dataset.currentGrade = grade || '';
    let displayGrade = grade || '—';
    let gradeClass = '';
    const num = parseFloat(grade);
    if (num === 5) gradeClass = 'grade-5';
    else if (num === 4) gradeClass = 'grade-4';
    else if (num === 3) gradeClass = 'grade-3';
    else if (num === 2) gradeClass = 'grade-2';
    else if (num === 1) gradeClass = 'grade-1';
    const studentId = cell.dataset.studentId, subjectId = cell.dataset.subjectId;
    cell.className = `final-grade-cell ${gradeClass}`;
    cell.textContent = displayGrade;
    if (studentId) cell.setAttribute('data-student-id', studentId);
    if (subjectId) cell.setAttribute('data-subject-id', subjectId);
    if (scale) cell.setAttribute('data-scale', scale);
    cell.setAttribute('data-current-grade', grade || '');
    cell.onclick = function() { startEditFinalGrade(cell); };
  }

async function updateStudentStats(studentId) {
    if (!currentGroupId || !currentSubjectId) return;
    
    const lessonsSnap = await getDocs(query(collection(db, "lessons"), where("subjectId", "==", currentSubjectId), where("teacherId", "==", currentTeacherId)));
    const lessons = [];
    lessonsSnap.forEach(l => lessons.push({ id: l.id, ...l.data() }));
    lessons.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (dateA !== dateB) return dateA - dateB;
        return (a.id || '').localeCompare(b.id || '');
    });
    
    let totalPoints = 0, gradeCount = 0, nCount = 0, svCount = 0;
    for (const lesson of lessons) {
        const gradeSnap = await getDocs(query(collection(db, "grades"), where("lessonId", "==", lesson.id), where("studentId", "==", studentId)));
        if (!gradeSnap.empty) {
            const grade = gradeSnap.docs[0].data().grade;
            if (grade === 'н') nCount++;
            else if (grade === 'св') svCount++;
            else { const num = parseFloat(grade); if (!isNaN(num)) { totalPoints += num; gradeCount++; } }
        }
    }
    
    const avg = gradeCount > 0 ? (totalPoints / gradeCount).toFixed(1) : '-';
    const avgNum = parseFloat(avg);
    
    const row = document.querySelector(`.journal-table td[data-student-id="${studentId}"]`)?.closest('tr');
    if (row) {
        const avgCell = row.querySelector('td:nth-last-child(4)');
        if (avgCell) {
            // Оновлене підсвічування для середньої оцінки
            let avgClass = '';
            if (!isNaN(avgNum)) {
                const avgRounded = Math.round(avgNum);
                if (avgRounded >= 5) avgClass = 'grade-5';
                else if (avgRounded === 4) avgClass = 'grade-4';
                else if (avgRounded === 3) avgClass = 'grade-3';
                else if (avgRounded === 2) avgClass = 'grade-2';
                else if (avgRounded <= 1) avgClass = 'grade-1';
            }
            avgCell.className = `stat-cell ${avgClass}`;
            avgCell.style.fontWeight = '700';
            avgCell.textContent = avg;
        }
        const nCell = row.querySelector('td:nth-last-child(3)');
        if (nCell) { nCell.className = 'stat-cell-red-text'; nCell.textContent = nCount; }
        const svCell = row.querySelector('td:nth-last-child(2)');
        if (svCell) { svCell.className = 'stat-cell-red-text'; svCell.textContent = svCount; }
    }
}

async function updateFinalGradeForStudent(studentId, subjectId, scale) {
    if (!studentId || !subjectId) return;
    const finalSnap = await getDocs(query(collection(db, "finalGrades"), where("studentId", "==", studentId), where("subjectId", "==", subjectId)));
    const finalGrade = !finalSnap.empty ? finalSnap.docs[0].data().grade : '';
    const row = document.querySelector(`.journal-table td[data-student-id="${studentId}"]`)?.closest('tr');
    if (row) {
        const finalCell = row.querySelector('.final-grade-cell');
        if (finalCell) {
            // Оновлене підсвічування для підсумкової оцінки
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
            finalCell.className = `final-grade-cell ${finalGradeClass}`;
            finalCell.textContent = finalGrade || '—';
            finalCell.setAttribute('data-current-grade', finalGrade || '');
        }
    }
}
  // ========== ФУНКЦІЇ РЕДАГУВАННЯ КОМІРОК ==========
  function saveAndCloseInput(input, cell) {
    if (!input || !cell || currentEditingCell !== cell) return;
    const newGrade = input.value.trim();
    const lessonId = input.dataset.lessonId, studentId = input.dataset.studentId, subjectId = input.dataset.subjectId, scale = input.dataset.scale, cellType = input.dataset.cellType;
    if (cellType === 'grade' && lessonId) {
      saveGradeDirect(lessonId, studentId, newGrade, scale);
      updateGradeCellDisplay(cell, newGrade, scale);
      updateFinalGradeForStudent(studentId, subjectId || currentSubjectId, scale);
    } else if (cellType === 'final' && subjectId) {
      saveFinalGradeDirect(studentId, subjectId, newGrade, scale);
      updateFinalGradeCellDisplay(cell, newGrade, scale);
    }
    if (input.parentNode === cell) { try { cell.removeChild(input); } catch(e) {} }
    cell.style.padding = '10px 12px';
    if (currentEditingCell === cell) { currentEditingCell = null; currentActiveInput = null; }
  }

  function cancelEdit(input, cell) {
    if (!input || !cell) return;
    const originalGrade = cell.dataset.currentGrade || '';
    const lessonId = cell.dataset.lessonId;
    if (lessonId) updateGradeCellDisplay(cell, originalGrade, cell.dataset.scale);
    else updateFinalGradeCellDisplay(cell, originalGrade, cell.dataset.scale);
    if (input.parentNode === cell) { try { cell.removeChild(input); } catch(e) {} }
    cell.style.padding = '10px 12px';
    if (currentEditingCell === cell) { currentEditingCell = null; currentActiveInput = null; }
  }

function moveToNextGradeCell(currentCell) {
    const row = currentCell.closest('tr');
    if (!row) return;
    const gradeCells = Array.from(row.querySelectorAll('.grade-cell, .final-grade-cell'));
    const currentIndex = gradeCells.indexOf(currentCell);
    if (currentIndex < gradeCells.length - 1) {
        const nextCell = gradeCells[currentIndex + 1];
        if (nextCell.classList.contains('grade-cell')) startEditGrade(nextCell);
        else startEditFinalGrade(nextCell);
    } else {
        const nextRow = row.nextElementSibling;
        if (nextRow) { 
            const firstCell = nextRow.querySelector('.grade-cell'); 
            if (firstCell) startEditGrade(firstCell); 
        }
    }
} 

  window.startEditGrade = function(cell) {
    if (currentEditingCell === cell) return;
    
    if (currentEditingCell && currentActiveInput) {
      const oldCell = currentEditingCell;
      const oldInput = currentActiveInput;
      const newGrade = oldInput.value.trim();
      const lessonId = oldCell.dataset.lessonId;
      const studentId = oldCell.dataset.studentId;
      const scale = oldCell.dataset.scale;
      
      if (lessonId) {
        saveGradeDirect(lessonId, studentId, newGrade, scale);
        updateGradeCellDisplay(oldCell, newGrade, scale);
      } else {
        const subjectId = oldCell.dataset.subjectId;
        if (subjectId) {
          saveFinalGradeDirect(studentId, subjectId, newGrade, scale);
          updateFinalGradeCellDisplay(oldCell, newGrade, scale);
        }
      }
      safeRemoveInput(oldInput, oldCell);
      oldCell.style.padding = '10px 12px';
      currentEditingCell = null;
      currentActiveInput = null;
    }
    
    const lessonId = cell.dataset.lessonId;
    const studentId = cell.dataset.studentId;
    const subjectId = cell.dataset.subjectId;
    const scale = cell.dataset.scale;
    
    currentEditingCell = cell;
    
    const input = document.createElement('input');
    input.type = 'text';
    input.value = '';
    input.placeholder = '';
    input.className = 'grade-input';
    input.style.cssText = 'width:60px;font-size:13px;font-family:inherit;text-align:center';
    
    input.dataset.lessonId = lessonId || '';
    input.dataset.studentId = studentId || '';
    input.dataset.subjectId = subjectId || '';
    input.dataset.scale = scale || '';
    input.dataset.cellType = lessonId ? 'grade' : 'final';
    
    input.addEventListener('blur', function(e) {
      setTimeout(() => {
        if (currentEditingCell === cell && currentActiveInput === input && document.activeElement !== input) {
          saveAndCloseInput(input, cell);
        }
      }, 100);
    });
    
    input.addEventListener('focusout', function(e) {
      setTimeout(() => {
        if (currentEditingCell === cell && currentActiveInput === input && document.activeElement !== input) {
          saveAndCloseInput(input, cell);
        }
      }, 150);
    });
    
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        saveAndCloseInput(input, cell);
        setTimeout(() => moveToNextGradeCell(cell), 10);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit(input, cell);
      }
      e.stopPropagation();
    });
    
    cell.innerHTML = '';
    cell.style.padding = '4px';
    cell.appendChild(input);
    currentActiveInput = input;
    input.focus();
  };

  window.startEditFinalGrade = function(cell) {
    if (currentEditingCell === cell) return;
    if (currentEditingCell && currentActiveInput) {
      const oldCell = currentEditingCell, oldInput = currentActiveInput, newGrade = oldInput.value.trim(), lessonId = oldCell.dataset.lessonId, studentId = oldCell.dataset.studentId, scale = oldCell.dataset.scale;
      if (lessonId) { saveGradeDirect(lessonId, studentId, newGrade, scale); updateGradeCellDisplay(oldCell, newGrade, scale); }
      else { const subjectId = oldCell.dataset.subjectId; if (subjectId) { saveFinalGradeDirect(studentId, subjectId, newGrade, scale); updateFinalGradeCellDisplay(oldCell, newGrade, scale); } }
      safeRemoveInput(oldInput, oldCell); oldCell.style.padding = '10px 12px'; currentEditingCell = null; currentActiveInput = null;
    }
    const studentId = cell.dataset.studentId, subjectId = cell.dataset.subjectId, scale = cell.dataset.scale;
    currentEditingCell = cell;
    const input = document.createElement('input');
    input.type = 'text'; input.value = ''; input.placeholder = ''; input.className = 'grade-input';
    input.style.cssText = 'width:60px;font-size:13px;font-family:inherit;text-align:center';
    input.dataset.studentId = studentId || ''; input.dataset.subjectId = subjectId || ''; input.dataset.scale = scale || ''; input.dataset.cellType = 'final';
    input.addEventListener('blur', function(e) { setTimeout(() => { if (currentEditingCell === cell && currentActiveInput === input && document.activeElement !== input) saveAndCloseInput(input, cell); }, 100); });
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); saveAndCloseInput(input, cell); setTimeout(() => moveToNextGradeCell(cell), 10); }
      else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(input, cell); }
      e.stopPropagation();
    });
    cell.innerHTML = ''; cell.style.padding = '4px'; cell.appendChild(input); currentActiveInput = input; input.focus();
  };

  // ========== ФУНКЦІЯ ВІДОБРАЖЕННЯ ЖУРНАЛУ ==========
async function renderJournal() {
    const groupId = document.getElementById("journalGroupSelect").value;
    const subjectId = document.getElementById("journalSubjectSelect").value;
    const year = document.getElementById("journalYearSelect").value;
    
    if (!year || !groupId || !subjectId || groupId === "Оберіть групу" || subjectId === "Оберіть предмет") {
        document.getElementById("journalTableContainer").innerHTML = '<div class="empty-state">Оберіть навчальний рік, групу та предмет/дисципліну</div>';
        return;
    }

    currentGroupId = groupId;
    currentSubjectId = subjectId;
    
    const subjectDoc = await getDoc(doc(db, "subjects", subjectId));
    const subjectScale = subjectDoc.exists() ? subjectDoc.data().scale : '12';
    const subjectControl = subjectDoc.exists() ? (subjectDoc.data().control || 'залік') : 'залік';
    
    const studentsSnap = await getDocs(query(collection(db, "students"), where("groupId", "==", groupId)));
    const students = [];
    studentsSnap.forEach(d => students.push({ id: d.id, ...d.data() }));
    students.sort((a, b) => a.name.localeCompare(b.name));
    
    if (students.length === 0) {
        document.getElementById("journalTableContainer").innerHTML = '<div class="empty-state">Немає студентів у групі</div>';
        return;
    }
    
    const lessonsSnap = await getDocs(query(collection(db, "lessons"), where("subjectId", "==", subjectId), where("teacherId", "==", currentTeacherId)));
    const lessons = [];
    lessonsSnap.forEach(l => lessons.push({ id: l.id, ...l.data() }));
    
    lessons.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (dateA !== dateB) return dateA - dateB;
        return (a.id || '').localeCompare(b.id || '');
    });
    
    if (lessons.length === 0) {
        document.getElementById("journalTableContainer").innerHTML = '<div class="empty-state">Немає занять з цього предмета. Додайте заняття у вкладці "Заняття"</div>';
        return;
    }
    
    const allGrades = {};
    for (const lesson of lessons) {
        const gradesSnap = await getDocs(query(collection(db, "grades"), where("lessonId", "==", lesson.id)));
        gradesSnap.forEach(g => {
            const gradeData = g.data();
            if (!allGrades[lesson.id]) allGrades[lesson.id] = {};
            allGrades[lesson.id][gradeData.studentId] = gradeData.grade;
        });
    }
    
    const finalGrades = {};
    const finalGradesSnap = await getDocs(query(collection(db, "finalGrades"), where("subjectId", "==", subjectId)));
    finalGradesSnap.forEach(g => {
        finalGrades[g.data().studentId] = g.data().grade;
    });
    
    const studentStats = {};
    students.forEach(student => {
        let totalPoints = 0, gradeCount = 0, nCount = 0, svCount = 0;
        lessons.forEach(lesson => {
            const grade = allGrades[lesson.id]?.[student.id];
            if (grade) {
                if (grade === 'н') nCount++;
                else if (grade === 'св') svCount++;
                else {
                    const num = parseFloat(grade);
                    if (!isNaN(num)) {
                        totalPoints += num;
                        gradeCount++;
                    }
                }
            }
        });
        studentStats[student.id] = {
            avg: gradeCount > 0 ? (totalPoints / gradeCount).toFixed(1) : '-',
            n: nCount,
            sv: svCount
        };
    });
    
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
    
    // Якщо предмет має екзамен - додаємо колонку Екзамен замість Підсумкової
    const isExam = (subjectControl === 'екзамен');
    const finalColHeader = isExam ? 'Екзамен' : 'Підсумкова';
    html += `<th class="stat-cell">Сер.</th><th class="stat-header-red">Н</th><th class="stat-header-red">СВ</th><th class="stat-cell">${finalColHeader}</th></tr></thead><tbody>`;
    
    let studentCounter = 1;
    for (const student of students) {
        const stats = studentStats[student.id];
        const finalGrade = finalGrades[student.id] || '';
        
        // Підсвічування для середньої оцінки
        let avgClass = '';
        const avgNum = parseFloat(stats.avg);
        if (!isNaN(avgNum)) {
            const avgRounded = Math.round(avgNum);
            if (avgRounded >= 5) avgClass = 'grade-5';
            else if (avgRounded === 4) avgClass = 'grade-4';
            else if (avgRounded === 3) avgClass = 'grade-3';
            else if (avgRounded === 2) avgClass = 'grade-2';
            else if (avgRounded <= 1) avgClass = 'grade-1';
        }
        
        // Підсвічування для підсумкової оцінки
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
        
        html += `<tr><td style="text-align:center; width:40px;">${studentCounter}</td><td style="text-align:left"><strong>${student.name}</strong> ${student.role === 'prefect' ? '⭐' : ''}</td>`;
        
        for (const lesson of lessons) {
            const grade = allGrades[lesson.id]?.[student.id] || '';
            let gradeClass = '';
            let displayGrade = grade;
            if (grade === 'н') gradeClass = 'grade-n';
            else if (grade === 'св') gradeClass = 'grade-sv';
            else {
                const num = parseFloat(grade);
                if (num === 5) gradeClass = 'grade-5';
                else if (num === 4) gradeClass = 'grade-4';
                else if (num === 3) gradeClass = 'grade-3';
                else if (num === 2) gradeClass = 'grade-2';
                else if (num === 1) gradeClass = 'grade-1';
                displayGrade = grade;
            }
            html += `<td class="grade-cell ${gradeClass}" data-lesson-id="${lesson.id}" data-student-id="${student.id}" data-current-grade="${grade}" data-scale="${subjectScale}" onclick="startEditGrade(this)">${displayGrade || '—'}</td>`;
        }
        
        // Колонка "Сер." з кольоровим фоном
        html += `<td class="stat-cell ${avgClass}" style="font-weight:700;">${stats.avg}</td>
                 <td class="stat-cell-red-text">${stats.n}</td>
                 <td class="stat-cell-red-text">${stats.sv}</td>`;
        
        // Якщо екзамен - показуємо текст "Екзамен" замість комірки для введення
        if (isExam) {
            html += `<td class="stat-cell" style="font-weight:700;color:#7c3aed; text-align:center;">Екзамен</td>`;
        } else {
            html += `<td class="final-grade-cell ${finalGradeClass}" data-student-id="${student.id}" data-subject-id="${subjectId}" data-current-grade="${finalGrade}" data-scale="${subjectScale}" onclick="startEditFinalGrade(this)">${finalGrade || '—'}</td>`;
        }
        html += `</tr>`;
        studentCounter++;
    }
    
    html += '</tbody></table>';
    document.getElementById("journalTableContainer").innerHTML = html;
    
    document.querySelectorAll('.date-cell').forEach(cell => {
        cell.addEventListener('mouseenter', showTooltip);
        cell.addEventListener('mouseleave', hideTooltip);
    });
}

  // ========== ФУНКЦІЇ ПІДКАЗОК ==========
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

  // ========== ФУНКЦІЇ ДЛЯ РОБОТИ З ЗАНЯТТЯМИ ==========
async function getNextLessonNumberForType(type, subjectId) {
    // Отримуємо ВСІ заняття для цього предмета і типу
    const q = query(
        collection(db, "lessons"), 
        where("subjectId", "==", subjectId), 
        where("type", "==", type), 
        where("teacherId", "==", currentTeacherId)
    );
    const snap = await getDocs(q);
    
    // Знаходимо максимальний номер
    let maxNumber = 0;
    snap.forEach(doc => {
        const lesson = doc.data();
        const num = lesson.number;
        if (num && !isNaN(parseInt(num)) && parseInt(num) > maxNumber) {
            maxNumber = parseInt(num);
        }
    });
    
    // Повертаємо наступний номер
    const nextNumber = maxNumber + 1;
    console.log(`Next number for type ${type}: ${nextNumber} (max was ${maxNumber})`); // Для налагодження
    return nextNumber;
}

  window.editLesson = async (id) => {
    const snap = await getDoc(doc(db, "lessons", id));
    if (snap.exists() && snap.data().teacherId === currentTeacherId) {
      currentEditId = id;
      const d = snap.data();
      await updateSectionSelect(d.subjectId);
      document.getElementById("lessonSubject").value = d.subjectId;
      document.getElementById("lessonType").value = d.type;
      document.getElementById("lessonDate").value = d.date;
      document.getElementById("lessonTopic").value = d.topic || "";
      // Set section in custom dropdown
      const sectionHidden = document.getElementById("lessonSection");
      const sectionDisplay = document.getElementById("sectionSelectDisplay");
      if (d.sectionId) {
        if (sectionHidden) sectionHidden.value = d.sectionId;
        // Find section name from dropdown items after a short delay
        setTimeout(() => {
          const items = document.querySelectorAll("#sectionDropdown .section-dropdown-item .section-item-name");
          let found = false;
          items.forEach(item => {
            const parentItem = item.closest(".section-dropdown-item");
            if (parentItem && parentItem.getAttribute("onclick") && parentItem.getAttribute("onclick").includes(d.sectionId)) {
              if (sectionDisplay) sectionDisplay.textContent = item.textContent;
              found = true;
            }
          });
          if (!found && sectionDisplay) sectionDisplay.textContent = "Оберіть розділ";
        }, 350);
      } else {
        if (sectionHidden) sectionHidden.value = '';
        if (sectionDisplay) sectionDisplay.textContent = 'Без розділу';
      }
      document.getElementById("form-add-lesson").style.display = "block";
      const btn = document.getElementById("saveLessonBtn");
      btn.innerText = "Оновити";
      btn.onclick = () => updateLesson(id);
    }
  };

  async function updateLesson(id) {
    const subjectId = document.getElementById("lessonSubject").value;
    const type = document.getElementById("lessonType").value;
    const date = document.getElementById("lessonDate").value;
    const sectionSelect = document.getElementById("lessonSection");
    let sectionId = sectionSelect.value;
    const newSectionName = document.getElementById("newSectionName").value.trim();
    if (sectionId === "new" && newSectionName) sectionId = await createNewSection(subjectId, newSectionName);
    else if (sectionId === "new" && !newSectionName) { alert("Будь ласка, введіть назву нового розділу!"); return; }
    const currentLessonSnap = await getDoc(doc(db, "lessons", id));
    const currentNumber = currentLessonSnap.exists() ? currentLessonSnap.data().number : null;
    const data = {
      subjectId: subjectId,
      type: type,
      date: date,
      topic: document.getElementById("lessonTopic").value,
      sectionId: sectionId || null,
      teacherId: currentTeacherId
    };
    if (currentNumber) data.number = currentNumber;
    await updateDoc(doc(db, "lessons", id), data);
    resetLessonForm();
    loadMyLessons();
    if (document.getElementById("tab-journal").classList.contains("active")) renderJournal();
  }

window._globalSaveLessonHandler = async () => {
    if (currentEditId) {
        await updateLesson(currentEditId);
        return;
    }
    
    const date = document.getElementById("lessonDate").value;
    const type = document.getElementById("lessonType").value;
    const subjectId = document.getElementById("lessonSubject").value;
    const sectionSelect = document.getElementById("lessonSection");
    let sectionId = sectionSelect.value;
    const newSectionName = document.getElementById("newSectionName").value.trim();
    
    if (!subjectId || !date) {
        alert("Будь ласка, заповніть всі обов'язкові поля!");
        return;
    }
    
    if (sectionId === "new" && newSectionName) {
        sectionId = await createNewSection(subjectId, newSectionName);
    } else if (sectionId === "new" && !newSectionName) {
        alert("Будь ласка, введіть назву нового розділу!");
        return;
    }
    
    // Отримуємо наступний номер для цього типу заняття
    const nextNumber = await getNextLessonNumberForType(type, subjectId);
    
    // Перевіряємо, чи заняття з таким номером вже існує (на випадок гонки)
    const checkQ = query(
        collection(db, "lessons"), 
        where("subjectId", "==", subjectId), 
        where("type", "==", type), 
        where("number", "==", nextNumber),
        where("teacherId", "==", currentTeacherId)
    );
    const checkSnap = await getDocs(checkQ);
    
    let finalNumber = nextNumber;
    if (!checkSnap.empty) {
        // Якщо такий номер вже є, шукаємо вільний
        const allQ = query(
            collection(db, "lessons"), 
            where("subjectId", "==", subjectId), 
            where("type", "==", type), 
            where("teacherId", "==", currentTeacherId)
        );
        const allSnap = await getDocs(allQ);
        const existingNumbers = new Set();
        allSnap.forEach(doc => {
            const num = doc.data().number;
            if (num) existingNumbers.add(parseInt(num));
        });
        
        let candidate = 1;
        while (existingNumbers.has(candidate)) {
            candidate++;
        }
        finalNumber = candidate;
    }
    
    const data = {
        subjectId: subjectId,
        type: type,
        date: date,
        topic: document.getElementById("lessonTopic").value,
        number: finalNumber,
        sectionId: sectionId || null,
        teacherId: currentTeacherId,
        createdAt: new Date().toISOString()
    };
    
    await addDoc(collection(db, "lessons"), data);
    
    if (document.getElementById("tab-journal").classList.contains("active")) {
        const currentSubject = document.getElementById("lessonSubject").value;
        if (currentSubject) await updateSectionSelect(currentSubject);
        await renderJournal();
    }
    
    resetLessonForm();
    loadMyLessons();
    if (document.getElementById("tab-journal").classList.contains("active")) renderJournal();
};
document.getElementById("saveLessonBtn").onclick = window._globalSaveLessonHandler;


  function resetLessonForm() {
    document.getElementById("lessonTopic").value = "";
    document.getElementById("lessonDate").value = "";
    const sectionHidden = document.getElementById("lessonSection");
    if (sectionHidden) sectionHidden.value = "";
    const sectionDisplay = document.getElementById("sectionSelectDisplay");
    if (sectionDisplay) sectionDisplay.textContent = "Оберіть розділ";
    const sectionDropdownEl2 = document.getElementById("sectionDropdown");
    if (sectionDropdownEl2) sectionDropdownEl2.classList.remove("open");
    document.getElementById("newSectionGroup").style.display = "none";
    document.getElementById("newSectionName").value = "";
    currentEditId = null;
    const btn = document.getElementById("saveLessonBtn");
    btn.innerText = "Зберегти";
    // Відновлюємо глобальний обробник
    if (window._globalSaveLessonHandler) btn.onclick = window._globalSaveLessonHandler;
    document.getElementById("form-add-lesson").style.display = "none";
  }

  // ========== ФУНКЦІЇ ДЛЯ РОЗДІЛІВ ==========
  async function loadSectionsForSubject(subjectId) {
    if (!subjectId) return [];
    const q = query(collection(db, "sections"), where("subjectId", "==", subjectId), where("teacherId", "==", currentTeacherId));
    const snap = await getDocs(q);
    const sections = [];
    snap.forEach(doc => sections.push({ id: doc.id, ...doc.data() }));
    sections.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return sections;
  }

async function updateSectionSelect(subjectId) {
    const sectionHidden = document.getElementById("lessonSection");
    const dropdown = document.getElementById("sectionDropdown");
    const display = document.getElementById("sectionSelectDisplay");
    if (!sectionHidden || !dropdown || !display) return;
    
    if (!subjectId) {
        dropdown.innerHTML = '';
        sectionHidden.value = '';
        display.textContent = 'Оберіть спочатку предмет';
        return;
    }
    
    const sections = await loadSectionsForSubject(subjectId);
    let html = '';
    
    // Option: no section
    html += `<div class="section-dropdown-item" data-section-value="" data-section-label="Без розділу" onclick="window.selectSection('', 'Без розділу', event)">
        <span class="section-item-name">Без розділу</span>
    </div>`;
    
    sections.forEach(s => {
        // Екрануємо назву для безпечного використання в onclick
        const escapedName = s.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        html += `<div class="section-dropdown-item" data-section-value="${s.id}" data-section-label="${escapedName}" onclick="window.selectSection('${s.id}', '${escapedName}', event)">
            <span class="section-item-name">${escapeHtml(s.name)}</span>
            <button class="section-item-delete" onclick="event.stopPropagation(); window.deleteSectionFromDropdown('${s.id}','${escapedName}', '${subjectId}')" title="Видалити розділ">&times;</button>
        </div>`;
    });
    
    // Option: create new
    html += `<div class="section-dropdown-item" data-section-value="new" data-section-label="+ Створити новий розділ" onclick="window.selectSection('new', '+ Створити новий розділ', event)" style="color:var(--accent);font-weight:600;">
        <span class="section-item-name">+ Створити новий розділ</span>
    </div>`;
    
    dropdown.innerHTML = html;
    sectionHidden.value = '';
    display.textContent = 'Оберіть розділ';
    document.getElementById("newSectionGroup").style.display = "none";
    document.getElementById("newSectionName").value = "";
}

// Оновлена функція selectSection з event параметром
window.selectSection = function(value, label, event) {
  console.log('selectSection called with:', {value, label, event});
    if (event) {
        event.stopPropagation();
    }
    
    const sectionHidden = document.getElementById("lessonSection");
    const display = document.getElementById("sectionSelectDisplay");
    const dropdown = document.getElementById("sectionDropdown");
    
    if (sectionHidden) sectionHidden.value = value;
    if (display) display.textContent = label;
    if (dropdown) dropdown.classList.remove("open");
    
    if (value === "new") {
        document.getElementById("newSectionGroup").style.display = "block";
    } else {
        document.getElementById("newSectionGroup").style.display = "none";
        document.getElementById("newSectionName").value = "";
    }
  
};

  window.toggleSectionDropdown = function() {
    const dropdown = document.getElementById("sectionDropdown");
    if (dropdown) dropdown.classList.toggle("open");
  };

  window.selectSection = function(value, label) {
    const sectionHidden = document.getElementById("lessonSection");
    const display = document.getElementById("sectionSelectDisplay");
    const dropdown = document.getElementById("sectionDropdown");
    if (sectionHidden) sectionHidden.value = value;
    if (display) display.textContent = label;
    if (dropdown) dropdown.classList.remove("open");
    if (value === "new") {
      document.getElementById("newSectionGroup").style.display = "block";
    } else {
      document.getElementById("newSectionGroup").style.display = "none";
      document.getElementById("newSectionName").value = "";
    }
  };

  window.deleteSectionFromDropdown = async function(sectionId, sectionName, subjectId) {
    if (!confirm(`Видалити розділ "${sectionName}"? Всі заняття в цьому розділі будуть ВИДАЛЕНІ!`)) return;
    try {
      const lessonsQ = query(collection(db, "lessons"), where("sectionId", "==", sectionId), where("teacherId", "==", currentTeacherId));
      const lessonsSnap = await getDocs(lessonsQ);
      for (const lessonDoc of lessonsSnap.docs) {
        const gradesQ = query(collection(db, "grades"), where("lessonId", "==", lessonDoc.id));
        const gradesSnap = await getDocs(gradesQ);
        for (const gradeDoc of gradesSnap.docs) await deleteDoc(doc(db, "grades", gradeDoc.id));
        await deleteDoc(doc(db, "lessons", lessonDoc.id));
      }
      await deleteDoc(doc(db, "sections", sectionId));
      await updateSectionSelect(subjectId);
      await loadMyLessons();
      if (document.getElementById("tab-journal").classList.contains("active")) await renderJournal();
    } catch (error) {
      console.error("Помилка видалення розділу:", error);
      alert("Сталася помилка при видаленні розділу");
    }
  };

  async function refreshSectionsList() {
    const subjectId = document.getElementById("lessonSubject").value;
    if (subjectId) await updateSectionSelect(subjectId);
  }

  async function createNewSection(subjectId, sectionName) {
    const sectionData = { name: sectionName, subjectId: subjectId, teacherId: currentTeacherId, createdAt: new Date().toISOString() };
    const docRef = await addDoc(collection(db, "sections"), sectionData);
    if (subjectId) await updateSectionSelect(subjectId);
    return docRef.id;
  }

  // ========== ФУНКЦІЇ ДЛЯ ВИДАЛЕННЯ ==========
  window.deleteAllLessonsForSubject = async function() {
    const filterSubject = document.getElementById("lessonFilterSubject").value;
    if (filterSubject === "all") {
      alert("Спочатку оберіть конкретний предмет у фільтрі!");
      return;
    }
    
    const checkQ = query(collection(db, "lessons"), where("teacherId", "==", currentTeacherId), where("subjectId", "==", filterSubject));
    const checkSnap = await getDocs(checkQ);
    
    if (checkSnap.empty) {
      alert("Немає занять для видалення!");
      return;
    }
    
    if (!confirm(`Ви дійсно хочете видалити ВСІ заняття для вибраного предмета? Цю дію не можна скасувати!`)) {
      return;
    }
    
    try {
      let count = 0;
      for (const docSnap of checkSnap.docs) {
        await deleteDoc(doc(db, "lessons", docSnap.id));
        count++;
      }
      alert(`Видалено ${count} занять`);
      await loadMyLessons();
      await window.updateDeleteAllButton();
      if (document.getElementById("tab-journal").classList.contains("active")) renderJournal();
    } catch (error) {
      console.error("Помилка видалення занять:", error);
      alert("Сталася помилка при видаленні занять");
    }
  };

  window.deleteSection = async function(sectionId, sectionName) {
    if (!confirm(`Видалити розділ "${sectionName}"? Всі заняття в цьому розділі будуть ВИДАЛЕНІ без можливості відновлення!`)) {
      return;
    }
    
    try {
      const lessonsQ = query(collection(db, "lessons"), where("sectionId", "==", sectionId), where("teacherId", "==", currentTeacherId));
      const lessonsSnap = await getDocs(lessonsQ);
      let deletedCount = 0;
      
      for (const lessonDoc of lessonsSnap.docs) {
        const gradesQ = query(collection(db, "grades"), where("lessonId", "==", lessonDoc.id));
        const gradesSnap = await getDocs(gradesQ);
        for (const gradeDoc of gradesSnap.docs) {
          await deleteDoc(doc(db, "grades", gradeDoc.id));
        }
        await deleteDoc(doc(db, "lessons", lessonDoc.id));
        deletedCount++;
      }
      
      await deleteDoc(doc(db, "sections", sectionId));
      alert(`Розділ "${sectionName}" видалено. Видалено ${deletedCount} занять.`);
      await loadMyLessons();
      const subjectId = document.getElementById("lessonSubject").value;
      if (subjectId) await updateSectionSelect(subjectId);
      if (document.getElementById("tab-journal").classList.contains("active")) await renderJournal();
      if (typeof window.updateDeleteAllButton === 'function') await window.updateDeleteAllButton();
    } catch (error) {
      console.error("Помилка видалення розділу:", error);
      alert("Сталася помилка при видаленні розділу");
    }
  };

  window.toggleSection = function(sectionId) {
    const sectionElement = document.getElementById(`section-${sectionId}`);
    if (sectionElement) {
      sectionElement.classList.toggle('section-collapsed');
      const toggleBtn = sectionElement.querySelector('.section-toggle-btn');
      if (toggleBtn) {
        toggleBtn.textContent = sectionElement.classList.contains('section-collapsed') ? '▶' : '▼';
      }
      // Зберігаємо стан у localStorage
      const isCollapsed = sectionElement.classList.contains('section-collapsed');
      const storageKey = `section_state_${sectionId}`;
      if (isCollapsed) {
        localStorage.setItem(storageKey, 'collapsed');
      } else {
        localStorage.removeItem(storageKey);
      }
    }
  };

  window.updateDeleteAllButton = async function() {
    const filterSubject = document.getElementById("lessonFilterSubject").value;
    const deleteBtn = document.getElementById("deleteAllLessonsBtn");
    if (!deleteBtn) return;
    
    if (filterSubject === "all") {
      deleteBtn.style.display = "none";
      return;
    }
    
    try {
      const q = query(collection(db, "lessons"), where("teacherId", "==", currentTeacherId), where("subjectId", "==", filterSubject));
      const snap = await getDocs(q);
      deleteBtn.style.display = snap.empty ? "none" : "inline-flex";
    } catch (error) {
      console.error("Помилка перевірки занять:", error);
      deleteBtn.style.display = "none";
    }
  };

  // ========== ОСНОВНА ФУНКЦІЯ ЗАВАНТАЖЕННЯ ЗАНЯТЬ ==========
  async function loadMyLessons() {
    let lessonsQuery = query(collection(db, "lessons"), where("teacherId", "==", currentTeacherId));
    const filterSubject = document.getElementById("lessonFilterSubject").value;
    if (filterSubject !== "all") {
      lessonsQuery = query(lessonsQuery, where("subjectId", "==", filterSubject));
    }
    const snap = await getDocs(lessonsQuery);
    
    const subjectsSnap = await getDocs(query(collection(db, "subjects"), where("teacherId", "==", currentTeacherId)));
    const subMap = {};
    for (const docSnap of subjectsSnap.docs) {
      const s = docSnap.data();
      const groupsSnap = await getDocs(query(collection(db, "groups"), where("id", "==", s.groupId)));
      let groupName = '', academicYear = '';
      if (!groupsSnap.empty) {
        groupName = groupsSnap.docs[0].data().name;
        academicYear = groupsSnap.docs[0].data().academicYear || '';
      }
      subMap[docSnap.id] = { name: s.name, group: groupName, year: academicYear || s.academicYear };
    }
    
    const sectionsSnap = await getDocs(query(collection(db, "sections"), where("teacherId", "==", currentTeacherId)));
    const sectionMap = {};
    sectionsSnap.forEach(doc => { sectionMap[doc.id] = doc.data().name; });
    
    const container = document.getElementById("lessonsList");
    if (snap.empty) {
      container.innerHTML = '<div class="empty-state">Занять не знайдено</div>';
      if (typeof window.updateDeleteAllButton === 'function') await window.updateDeleteAllButton();
      return;
    }
    
    const lessonsArray = [];
    snap.forEach(docSnap => {
      lessonsArray.push({
        id: docSnap.id,
        ...docSnap.data(),
        createdAt: docSnap.data().createdAt || new Date(0).toISOString()
      });
    });
    
    const groupedBySection = {};
    lessonsArray.forEach(lesson => {
      const sectionId = lesson.sectionId || 'without_section';
      if (!groupedBySection[sectionId]) groupedBySection[sectionId] = [];
      groupedBySection[sectionId].push(lesson);
    });
    
    for (const sectionId in groupedBySection) {
      groupedBySection[sectionId].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    
    const sectionsList = [];
    for (const sectionId in groupedBySection) {
      const lessons = groupedBySection[sectionId];
      const latestLesson = lessons[0];
      const latestDate = latestLesson?.createdAt ? new Date(latestLesson.createdAt) : new Date(0);
      const sectionDoc = sectionId !== 'without_section' ? await getDoc(doc(db, "sections", sectionId)) : null;
      const createdAtSection = sectionDoc?.data()?.createdAt ? new Date(sectionDoc.data().createdAt) : null;
      sectionsList.push({
        id: sectionId,
        name: sectionMap[sectionId] || 'Без розділу',
        lessons: lessons,
        latestDate: latestDate,
        createdAt: createdAtSection
      });
    }
    
    sectionsList.sort((a, b) => {
      if (a.latestDate.getTime() !== b.latestDate.getTime()) return b.latestDate - a.latestDate;
      const aTime = a.createdAt ? a.createdAt.getTime() : 0;
      const bTime = b.createdAt ? b.createdAt.getTime() : 0;
      return bTime - aTime;
    });
    
    let html = '';
    for (const section of sectionsList) {
      const sectionIdSafe = section.id.replace(/[^a-zA-Z0-9]/g, '_');
      const isWithoutSection = section.name === 'Без розділу';
      
      if (!isWithoutSection) {
        html += `<div id="section-${sectionIdSafe}" class="section-wrapper">
                    <div class="section-header-wrapper">
                        <div class="section-header-title" onclick="window.toggleSection('${sectionIdSafe}')">
                            <span class="section-toggle-btn">▼</span> 📁 ${escapeHtml(section.name)} <span style="font-size: 11px; color: #6b7280; margin-left: 8px;">(${section.lessons.length} занять)</span>
                        </div>
                        <div class="section-header-actions">
                            <button class="section-delete-btn" onclick="event.stopPropagation(); window.deleteSection('${section.id}', '${escapeHtml(section.name).replace(/'/g, "\\'")}')" title="Видалити розділ">🗑️</button>
                        </div>
                    </div>
                    <div class="data-list">`;
      } else {
        html += `<div id="section-${sectionIdSafe}" class="section-wrapper"><div class="data-list">`;
      }
      
      for (const l of section.lessons) {
        const dateParts = l.date.split('-');
        const formattedDate = `${dateParts[2]}.${dateParts[1]}.${dateParts[0]}`;
        
        let typeShort = '';
        switch (l.type) {
          case 'Лекція': typeShort = 'Лек'; break;
          case 'Практичне заняття': typeShort = 'Прак'; break;
          case 'Лабораторне заняття': typeShort = 'Лаб'; break;
          case 'Семінарське заняття': typeShort = 'Сем'; break;
          case 'Самостійне вивчення': typeShort = 'С.в.'; break;
          case 'Залік з модуля': typeShort = 'Залік'; break;
          case 'Тематичне оцінювання': typeShort = 'Тем.'; break;
          default: typeShort = l.type;
        }
        
        const subjectInfo = subMap[l.subjectId];
        const subjectDisplay = subjectInfo ? `${subjectInfo.name} (${subjectInfo.group} | ${subjectInfo.year})` : l.subjectId;
        
        html += `<div class="data-card">
                    <div class="data-info">
                        <div class="data-icon">📅</div>
                        <div>
                            <div class="data-title">${escapeHtml(l.topic) || "Без теми"}</div>
                            <div class="data-sub">${escapeHtml(subjectDisplay)} | ${typeShort} | ${formattedDate}</div>
                        </div>
                    </div>
                    <div class="data-actions">
                        <button class="icon-btn edit-btn" onclick="window.editLesson('${l.id}')">✏️</button>
                        <button class="icon-btn delete-btn" onclick="window.deleteItem('lessons','${l.id}')">🗑️</button>
                    </div>
                </div>`;
      }
      html += `</div></div>`;
    }
    
    container.innerHTML = html;
    // Відновлюємо стан згортання розділів із localStorage
    for (const section of sectionsList) {
      const sectionIdSafe = section.id.replace(/[^a-zA-Z0-9]/g, '_');
      const storageKey = `section_state_${sectionIdSafe}`;
      if (localStorage.getItem(storageKey) === 'collapsed') {
        const sectionElement = document.getElementById(`section-${sectionIdSafe}`);
        if (sectionElement) {
          sectionElement.classList.add('section-collapsed');
          const toggleBtn = sectionElement.querySelector('.section-toggle-btn');
          if (toggleBtn) toggleBtn.textContent = '▶';
        }
      }
    }
    if (typeof window.updateDeleteAllButton === 'function') await window.updateDeleteAllButton();
  }

  // ========== ФУНКЦІЇ ДЛЯ ГРУП ==========
  async function loadGroups() {
    const snap = await getDocs(collection(db, "groups"));
    const container = document.getElementById("groupsList");
    if (snap.empty) { container.innerHTML = '<div class="empty-state">Груп не знайдено</div>'; return; }
    const studentsSnap = await getDocs(collection(db, "students"));
    const studentCountByGroup = {};
    studentsSnap.forEach(s => { const groupId = s.data().groupId; if (groupId) studentCountByGroup[groupId] = (studentCountByGroup[groupId] || 0) + 1; });
    const groupsByYear = {};
    snap.forEach(docSnap => { const g = docSnap.data(); const year = g.academicYear || 'Не вказано'; if (!groupsByYear[year]) groupsByYear[year] = []; groupsByYear[year].push({ id: docSnap.id, name: g.name, studentCount: studentCountByGroup[docSnap.id] || 0 }); });
    const sortedYears = Object.keys(groupsByYear).sort((a, b) => { if (a === 'Не вказано') return 1; if (b === 'Не вказано') return -1; const aStart = parseInt(a.split('/')[0]); const bStart = parseInt(b.split('/')[0]); return bStart - aStart; });
    let html = '';
    for (const year of sortedYears) {
      const groups = groupsByYear[year];
      groups.sort((a, b) => a.name.localeCompare(b.name));
      html += `<div class="year-group"><div class="year-title">${year} <span class="group-count">(${groups.length} груп)</span></div><div class="data-list">`;
      groups.forEach(g => {
        html += `<div class="data-card" onclick="window.showGroupStats('${g.id}','${g.name}')"><div class="data-info"><div class="data-icon">👥</div><div><div class="data-title">${g.name}</div><div class="data-sub">Студентів: ${g.studentCount}</div></div></div><div class="data-actions"><button class="icon-btn edit-btn" onclick="event.stopPropagation(); window.editGroup('${g.id}','${g.name}','${year}')">✏️</button><button class="icon-btn delete-btn" onclick="event.stopPropagation(); window.deleteItem('groups','${g.id}')">🗑️</button></div></div>`;
      });
      html += `</div></div>`;
    }
    container.innerHTML = html;
    populateSelects();
  }

  window.editGroup = (id, name, year) => {
    currentEditId = id;
    document.getElementById("groupName").value = name;
    document.getElementById("groupYear").value = year || '2025/2026';
    window.toggleForm('form-add-group');
    const btn = document.getElementById("saveGroupBtn");
    btn.innerText = "Оновити";
    btn.onclick = async () => {
      const newName = document.getElementById("groupName").value;
      const newYear = document.getElementById("groupYear").value;
      if (newName) {
        await updateDoc(doc(db, "groups", id), { name: newName, academicYear: newYear });
        resetGroupForm();
        loadGroups();
        updateStats();
      }
    };
  };

function resetGroupForm() {
    document.getElementById("groupName").value = "";
    document.getElementById("groupYear").value = "2025/2026";
    currentEditId = null;
    const btn = document.getElementById("saveGroupBtn");
    btn.innerText = "Зберегти";
    btn.onclick = async () => {
        const name = document.getElementById("groupName").value;
        const academicYear = document.getElementById("groupYear").value;
        if (name) {
            await addGroupAndUpdateSelects(name, academicYear); // ВИКОРИСТОВУЄМО НОВУ ФУНКЦІЮ
        }
    };
    document.getElementById("form-add-group").style.display = "none";
}

// ЗАМІНІТЬ ІСНУЮЧИЙ ОБРОБНИК saveGroupBtn НА ЦЕЙ:
document.getElementById("saveGroupBtn").onclick = async () => {
    if (currentEditId) return;
    const name = document.getElementById("groupName").value;
    const academicYear = document.getElementById("groupYear").value;
    if (name) {
        await addGroupAndUpdateSelects(name, academicYear); // ВИКОРИСТОВУЄМО НОВУ ФУНКЦІЮ
    }
};

  // НОВА ФУНКЦІЯ ДЛЯ ДОДАВАННЯ ГРУПИ ТА ОНОВЛЕННЯ ВСІХ SELECTІВ
async function addGroupAndUpdateSelects(groupName, academicYear) {
    // Додаємо групу в базу даних
    await addDoc(collection(db, "groups"), { name: groupName, academicYear });
    
    // ОНОВЛЮЄМО ВСІ СПИСКИ ГРУП В ІНТЕРФЕЙСІ
    
    // 1. Оновлюємо список груп у формі студента
    await loadGroupsToSelect(document.getElementById("studentGroup"));
    
    // 2. Оновлюємо список груп у формі предмета
    await loadGroupsToSelect(document.getElementById("subjectGroup"));
    
    // 3. Оновлюємо фільтри журналу (роки та групи)
    await populateJournalFilters();
    
    // 4. Оновлюємо список груп у вкладці "Групи"
    await loadGroups();
    
    // 5. Оновлюємо статистику
    await updateStats();
    
    console.log(`Групу "${groupName}" додано та оновлено всі списки`);
}

  // ========== ФУНКЦІЇ ДЛЯ СТУДЕНТІВ ==========
  async function loadStudents() {
    const snap = await getDocs(collection(db, "students"));
    const groupsSnap = await getDocs(collection(db, "groups"));
    const groupsMap = {};
    const groupsByYear = {};
    groupsSnap.forEach(d => {
      const group = { id: d.id, name: d.data().name, academicYear: d.data().academicYear || 'Не вказано' };
      groupsMap[d.id] = group;
      if (!groupsByYear[group.academicYear]) groupsByYear[group.academicYear] = [];
      groupsByYear[group.academicYear].push(group);
    });
    const yearFilter = document.getElementById("studentYearFilter");
    const currentYearValue = yearFilter.value;
    let yearOptions = '<option value="all">Всі роки</option>';
    const sortedYears = Object.keys(groupsByYear).sort((a, b) => { if (a === 'Не вказано') return 1; if (b === 'Не вказано') return -1; const aStart = parseInt(a.split('/')[0]); const bStart = parseInt(b.split('/')[0]); return bStart - aStart; });
    sortedYears.forEach(year => { yearOptions += `<option value="${year}">${year}</option>`; });
    yearFilter.innerHTML = yearOptions;
    if (currentYearValue !== 'all' && currentYearValue !== yearFilter.value) yearFilter.value = currentYearValue;
    const selectedYear = document.getElementById("studentYearFilter").value;
    const selectedGroup = document.getElementById("studentGroupFilter").value;
    let availableGroups = [];
    if (selectedYear !== 'all') availableGroups = groupsByYear[selectedYear] || [];
    else availableGroups = Object.values(groupsMap);
    const groupFilter = document.getElementById("studentGroupFilter");
    let groupOptions = '<option value="all">Всі групи</option>';
    availableGroups.forEach(g => { groupOptions += `<option value="${g.id}">${g.name}</option>`; });
    groupFilter.innerHTML = groupOptions;
    if (selectedGroup !== 'all' && groupFilter.querySelector(`option[value="${selectedGroup}"]`)) groupFilter.value = selectedGroup;
    else groupFilter.value = 'all';
    let students = [];
    snap.forEach(docSnap => { students.push({ id: docSnap.id, ...docSnap.data() }); });
    const finalGroupId = document.getElementById("studentGroupFilter").value;
    if (finalGroupId !== "all") students = students.filter(s => s.groupId === finalGroupId);
    students.sort((a, b) => a.name.localeCompare(b.name));
    const container = document.getElementById("studentsList");
    if (students.length === 0) { container.innerHTML = '<div class="empty-state">Студентів не знайдено</div>'; return; }
    let html = '<div class="data-list">';
    students.forEach(s => {
      const groupName = groupsMap[s.groupId]?.name || s.groupId;
      const academicYear = s.academicYear || groupsMap[s.groupId]?.academicYear || 'Не вказано';
      html += `<div class="data-card"><div class="data-info"><div class="data-icon">👨‍🎓</div><div><div class="data-title">${s.name} ${s.role === 'prefect' ? '<span class="prefect-badge">Староста</span>' : ''}</div><div class="data-sub">${groupName} | ${academicYear} | ${s.phone || ''}</div></div></div><div class="data-actions"><button class="icon-btn edit-btn" onclick="window.editStudent('${s.id}','${s.name}','${s.groupId}','${s.phone || ''}','${s.role || 'student'}','${academicYear}')">✏️</button><button class="icon-btn delete-btn" onclick="window.deleteItem('students','${s.id}')">🗑️</button></div></div>`;
    });
    html += '</div>';
    container.innerHTML = html;
  }

  window.editStudent = (id, name, groupId, phone, role, year) => {
    currentEditId = id;
    document.getElementById("studentName").value = name;
    document.getElementById("studentGroup").value = groupId;
    document.getElementById("studentYear").value = year || '2025/2026';
    document.getElementById("studentPhone").value = phone;
    document.getElementById("studentRole").value = role;
    window.toggleForm('form-add-student');
    const btn = document.getElementById("saveStudentBtn");
    btn.innerText = "Оновити";
    btn.onclick = async () => {
      const data = {
        name: document.getElementById("studentName").value,
        groupId: document.getElementById("studentGroup").value,
        academicYear: document.getElementById("studentYear").value,
        phone: document.getElementById("studentPhone").value,
        role: document.getElementById("studentRole").value
      };
      await updateDoc(doc(db, "students", id), data);
      resetStudentForm();
      loadStudents();
      loadGroups();
      updateStats();
    };
  };

  function resetStudentForm() {
    document.getElementById("studentName").value = "";
    document.getElementById("studentPhone").value = "";
    document.getElementById("studentYear").value = "2025/2026";
    document.getElementById("studentRole").value = "student";
    currentEditId = null;
    const btn = document.getElementById("saveStudentBtn");
    btn.innerText = "Зберегти";
    btn.onclick = async () => {
      const groupId = document.getElementById("studentGroup").value;
      const data = {
        name: document.getElementById("studentName").value,
        groupId: groupId,
        academicYear: document.getElementById("studentYear").value,
        phone: document.getElementById("studentPhone").value,
        role: document.getElementById("studentRole").value
      };
      if (data.name && data.groupId) {
        sessionStorage.setItem(STORAGE_KEYS.lastStudentGroup, groupId);
        await addDoc(collection(db, "students"), data);
        resetStudentForm();
        loadStudents();
        loadGroups();
        updateStats();
      }
    };
    document.getElementById("form-add-student").style.display = "none";
  }

  document.getElementById("saveStudentBtn").onclick = async () => {
    if (currentEditId) return;
    const groupId = document.getElementById("studentGroup").value;
    const data = {
      name: document.getElementById("studentName").value,
      groupId: groupId,
      academicYear: document.getElementById("studentYear").value,
      phone: document.getElementById("studentPhone").value,
      role: document.getElementById("studentRole").value
    };
    if (data.name && data.groupId) {
      sessionStorage.setItem(STORAGE_KEYS.lastStudentGroup, groupId);
      await addDoc(collection(db, "students"), data);
      resetStudentForm();
      loadStudents();
      loadGroups();
      updateStats();
    }
  };

  document.getElementById("studentYearFilter").addEventListener("change", () => loadStudents());
  document.getElementById("studentGroupFilter").addEventListener("change", () => loadStudents());

  // ========== ФУНКЦІЇ ДЛЯ ПРЕДМЕТІВ ==========
  async function loadMySubjects() {
    const snap = await getDocs(query(collection(db, "subjects"), where("teacherId", "==", currentTeacherId)));
    const groupsSnap = await getDocs(collection(db, "groups"));
    const groupsMap = {};
    groupsSnap.forEach(g => { groupsMap[g.id] = g.data().name; });
    const container = document.getElementById("subjectsList");
    if (snap.empty) { container.innerHTML = '<div class="empty-state">Предметів/дисциплін не знайдено. Додайте ваш перший предмет!</div>'; return; }
    let html = '<div class="data-list">';
    snap.forEach(docSnap => {
      const s = docSnap.data();
      const groupName = groupsMap[s.groupId] || s.groupId || 'Групу не обрано';
      html += `<div class="data-card" onclick="window.showSubjectInfo('${docSnap.id}')"><div class="data-info"><div class="data-icon">📘</div><div><div class="data-title">${s.name}</div><div class="data-sub">${groupName} | ${s.academicYear || 'Не вказано'}</div></div></div><div class="data-actions"><button class="icon-btn edit-btn" onclick="event.stopPropagation(); window.editSubject('${docSnap.id}')">✏️</button><button class="icon-btn delete-btn" onclick="event.stopPropagation(); window.deleteItem('subjects','${docSnap.id}')">🗑️</button></div></div>`;
    });
    html += '</div>';
    container.innerHTML = html;
    populateSelects();
  }

window.editSubject = async (id) => {
    const snap = await getDoc(doc(db, "subjects", id));
    if (snap.exists() && snap.data().teacherId === currentTeacherId) {
        currentEditId = id;
        const d = snap.data();
        
        // ОНОВЛЮЄМО СПИСОК ГРУП ПЕРЕД ЗАПОВНЕННЯМ ФОРМИ
        await loadGroupsToSelect(document.getElementById("subjectGroup"));
        
        document.getElementById("subjectName").value = d.name;
        document.getElementById("subjectScale").value = d.scale;
        document.getElementById("subjectControl").value = d.control || "залік";
        document.getElementById("subjectType").value = d.type;
        document.getElementById("subjectGroup").value = d.groupId || '';
        document.getElementById("subjectYear").value = d.academicYear || '2025/2026';
        document.getElementById("subjectCredits").value = d.credits || 0;
        document.getElementById("subjectHours").value = d.hours || 0;
        document.getElementById("subjectModules").value = d.modules || 0;
        document.getElementById("subjectLectures").value = d.lectures || 0;
        document.getElementById("subjectPracticals").value = d.practicals || 0;
        document.getElementById("subjectLabs").value = d.labs || 0;
        document.getElementById("subjectSeminars").value = d.seminars || 0;
        document.getElementById("subjectSelfStudy").value = d.selfStudy || 0;
        
        window.toggleForm('form-add-subject');
        const btn = document.getElementById("saveSubjectBtn");
        btn.innerText = "Оновити";
        btn.onclick = () => updateSubject(id);
    }
};

// ДОДАТИ НОВУ ФУНКЦІЮ ДЛЯ ЗАВАНТАЖЕННЯ ГРУП У SELECT
async function loadGroupsToSelect(selectElement) {
    if (!selectElement) return;
    
    const snap = await getDocs(collection(db, "groups"));
    let options = '<option value="">Оберіть групу</option>';
    
    // Сортуємо групи за роком та назвою
    const groupsArray = [];
    snap.forEach(doc => {
        groupsArray.push({
            id: doc.id,
            name: doc.data().name,
            academicYear: doc.data().academicYear || 'Не вказано'
        });
    });
    
    // Сортуємо спочатку за роком (новіші перші), потім за назвою
    groupsArray.sort((a, b) => {
        const yearCompare = b.academicYear.localeCompare(a.academicYear);
        if (yearCompare !== 0) return yearCompare;
        return a.name.localeCompare(b.name);
    });
    
    groupsArray.forEach(group => {
        options += `<option value="${group.id}">${group.name} (${group.academicYear})</option>`;
    });
    
    selectElement.innerHTML = options;
}

  async function updateSubject(id) {
    const groupsSnap = await getDocs(collection(db, "groups"));
    const groupsMap = {};
    groupsSnap.forEach(g => { groupsMap[g.id] = g.data().name; });
    const groupId = document.getElementById("subjectGroup").value;
    const data = {
      name: document.getElementById("subjectName").value,
      scale: document.getElementById("subjectScale").value,
      control: document.getElementById("subjectControl").value,
      type: document.getElementById("subjectType").value,
      groupId: groupId,
      groupName: groupsMap[groupId] || groupId,
      academicYear: document.getElementById("subjectYear").value,
      credits: parseInt(document.getElementById("subjectCredits").value) || 0,
      hours: parseInt(document.getElementById("subjectHours").value) || 0,
      modules: parseInt(document.getElementById("subjectModules").value) || 0,
      lectures: parseInt(document.getElementById("subjectLectures").value) || 0,
      practicals: parseInt(document.getElementById("subjectPracticals").value) || 0,
      labs: parseInt(document.getElementById("subjectLabs").value) || 0,
      seminars: parseInt(document.getElementById("subjectSeminars").value) || 0,
      selfStudy: parseInt(document.getElementById("subjectSelfStudy").value) || 0,
      teacherId: currentTeacherId
    };
    await updateDoc(doc(db, "subjects", id), data);
    resetSubjectForm();
    loadMySubjects();
    updateStats();
  }

  document.getElementById("saveSubjectBtn").onclick = async () => {
    if (currentEditId) await updateSubject(currentEditId);
    else {
      const groupsSnap = await getDocs(collection(db, "groups"));
      const groupsMap = {};
      groupsSnap.forEach(g => { groupsMap[g.id] = g.data().name; });
      const groupId = document.getElementById("subjectGroup").value;
      const data = {
        name: document.getElementById("subjectName").value,
        scale: document.getElementById("subjectScale").value,
        control: document.getElementById("subjectControl").value,
        type: document.getElementById("subjectType").value,
        groupId: groupId,
        groupName: groupsMap[groupId] || groupId,
        academicYear: document.getElementById("subjectYear").value,
        credits: parseInt(document.getElementById("subjectCredits").value) || 0,
        hours: parseInt(document.getElementById("subjectHours").value) || 0,
        modules: parseInt(document.getElementById("subjectModules").value) || 0,
        lectures: parseInt(document.getElementById("subjectLectures").value) || 0,
        practicals: parseInt(document.getElementById("subjectPracticals").value) || 0,
        labs: parseInt(document.getElementById("subjectLabs").value) || 0,
        seminars: parseInt(document.getElementById("subjectSeminars").value) || 0,
        selfStudy: parseInt(document.getElementById("subjectSelfStudy").value) || 0,
        teacherId: currentTeacherId
      };
      if (data.name) await addDoc(collection(db, "subjects"), data);
      resetSubjectForm();
      loadMySubjects();
      updateStats();
    }
  };

function resetSubjectForm() {
    document.getElementById("subjectName").value = "";
    document.getElementById("subjectScale").value = "12";
    document.getElementById("subjectControl").value = "залік";
    document.getElementById("subjectType").value = "Обов'язкова";
    // НЕ скидаємо subjectGroup, щоб зберегти список
    document.getElementById("subjectYear").value = "2025/2026";
    document.getElementById("subjectCredits").value = "";
    document.getElementById("subjectHours").value = "";
    document.getElementById("subjectModules").value = "";
    document.getElementById("subjectLectures").value = "0";
    document.getElementById("subjectPracticals").value = "0";
    document.getElementById("subjectLabs").value = "0";
    document.getElementById("subjectSeminars").value = "0";
    document.getElementById("subjectSelfStudy").value = "0";
    currentEditId = null;
    document.getElementById("saveSubjectBtn").innerText = "Зберегти";
    document.getElementById("form-add-subject").style.display = "none";
}
  // ========== ДОДАТКОВІ ФУНКЦІЇ ==========
  window.showGroupStats = async (groupId, groupName) => {
    const modal = document.getElementById("groupModal");
    const modalBody = document.getElementById("modalBody");
    modalBody.innerHTML = '<div class="loading-spinner"></div> Завантаження...';
    modal.classList.add("active");
    const studentsSnap = await getDocs(query(collection(db, "students"), where("groupId", "==", groupId)));
    const students = [];
    studentsSnap.forEach(s => students.push({ id: s.id, ...s.data() }));
    students.sort((a, b) => a.name.localeCompare(b.name));
    const subjectsSnap = await getDocs(query(collection(db, "subjects"), where("teacherId", "==", currentTeacherId), where("groupId", "==", groupId)));
    const subjects = [];
    subjectsSnap.forEach(s => subjects.push({ id: s.id, name: s.data().name, scale: s.data().scale }));
    const finalGrades = {};
    for (const student of students) {
      for (const subject of subjects) {
        const finalSnap = await getDocs(query(collection(db, "finalGrades"), where("studentId", "==", student.id), where("subjectId", "==", subject.id)));
        if (!finalSnap.empty) {
          const grade = finalSnap.docs[0].data().grade;
          const numGrade = parseFloat(grade);
          if (!isNaN(numGrade) && numGrade > 0) {
            if (!finalGrades[subject.id]) finalGrades[subject.id] = {};
            finalGrades[subject.id][student.id] = numGrade;
          }
        }
      }
    }
    const statsHtml = subjects.map(subject => {
      let gradeCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
      let totalPoints = 0, totalGrades = 0;
      students.forEach(student => {
        const grade = finalGrades[subject.id]?.[student.id];
        if (grade) {
          if (grade === 5) gradeCounts[5]++;
          else if (grade === 4) gradeCounts[4]++;
          else if (grade === 3) gradeCounts[3]++;
          else if (grade === 2) gradeCounts[2]++;
          else if (grade === 1) gradeCounts[1]++;
          totalPoints += grade;
          totalGrades++;
        }
      });
      const avgGrade = totalGrades > 0 ? (totalPoints / totalGrades).toFixed(2) : 0;
      const quality = students.length > 0 ? ((gradeCounts[5] + gradeCounts[4]) / students.length * 100).toFixed(1) : 0;
      return `<div class="stat-item"><div class="stat-label">${subject.name}</div><div class="stat-value">Середній бал: ${avgGrade}</div><div class="stat-label">Якість знань: ${Math.min(quality, 100)}%</div><div class="stat-label">Оцінки: 5:${gradeCounts[5]} | 4:${gradeCounts[4]} | 3:${gradeCounts[3]} | 2:${gradeCounts[2]} | 1:${gradeCounts[1]}</div></div>`;
    }).filter(s => s !== null);
    document.getElementById("modalTitle").innerHTML = `Статистика групи ${groupName}`;
    modalBody.innerHTML = statsHtml.length > 0 ? statsHtml.join('') : '<div class="stat-item">Немає підсумкових оцінок для статистики</div>';
  };

  window.closeModal = () => { document.getElementById("groupModal").classList.remove("active"); };

window.showSubjectInfo = async (subjectId) => {
    const snap = await getDoc(doc(db, "subjects", subjectId));
    if (snap.exists()) {
        const s = snap.data();
        
        // Створюємо HTML для розподілу годин у вигляді списку (кожен вид з нового рядка)
        let hoursHtml = '<div class="hours-breakdown">';
        let totalHours = 0;
        
        if (s.lectures && s.lectures > 0) {
            hoursHtml += `<div class="hours-breakdown-item"><span class="hours-breakdown-label">📖 Лекції:</span><span class="hours-breakdown-value">${s.lectures} год</span></div>`;
            totalHours += parseInt(s.lectures);
        }
        if (s.practicals && s.practicals > 0) {
            hoursHtml += `<div class="hours-breakdown-item"><span class="hours-breakdown-label">✏️ Практичні:</span><span class="hours-breakdown-value">${s.practicals} год</span></div>`;
            totalHours += parseInt(s.practicals);
        }
        if (s.labs && s.labs > 0) {
            hoursHtml += `<div class="hours-breakdown-item"><span class="hours-breakdown-label">🔬 Лабораторні:</span><span class="hours-breakdown-value">${s.labs} год</span></div>`;
            totalHours += parseInt(s.labs);
        }
        if (s.seminars && s.seminars > 0) {
            hoursHtml += `<div class="hours-breakdown-item"><span class="hours-breakdown-label">💬 Семінарські:</span><span class="hours-breakdown-value">${s.seminars} год</span></div>`;
            totalHours += parseInt(s.seminars);
        }
        if (s.selfStudy && s.selfStudy > 0) {
            hoursHtml += `<div class="hours-breakdown-item"><span class="hours-breakdown-label">📚 Самостійна робота:</span><span class="hours-breakdown-value">${s.selfStudy} год</span></div>`;
            totalHours += parseInt(s.selfStudy);
        }
        
        if (totalHours > 0) {
            hoursHtml += `<div class="hours-total"><span>📊 Загалом:</span><span>${totalHours} год</span></div>`;
        }
        hoursHtml += '</div>';
        
        if (hoursHtml === '<div class="hours-breakdown"></div>') {
            hoursHtml = '<div class="stat-value">Не вказано</div>';
        }
        
        document.getElementById("subjectModalTitle").innerHTML = s.name;
        document.getElementById("subjectModalBody").innerHTML = `
            <div class="stat-item">
                <div class="stat-label">Система оцінювання</div>
                <div class="stat-value">${s.scale}-бальна</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Вид контролю</div>
                <div class="stat-value">${s.control === 'екзамен' ? '📝 Екзамен' : '✅ Залік'}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Вид</div>
                <div class="stat-value">${s.type}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Група</div>
                <div class="stat-value">${s.groupName || s.groupId}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Навчальний рік</div>
                <div class="stat-value">${s.academicYear || 'Не вказано'}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Кредити ЄКТС</div>
                <div class="stat-value">${s.credits || 0}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Загально годин</div>
                <div class="stat-value">${s.hours || 0}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Кількість модулів</div>
                <div class="stat-value">${s.modules || 0}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Розподіл годин</div>
                ${hoursHtml}
            </div>
        `;
        document.getElementById("subjectModal").classList.add("active");
    }
};

  window.closeSubjectModal = () => { document.getElementById("subjectModal").classList.remove("active"); };

  async function updateStats() {
    const studentsSnap = await getDocs(collection(db, "students"));
    const groupsSnap = await getDocs(collection(db, "groups"));
    const subjectsSnap = await getDocs(query(collection(db, "subjects"), where("teacherId", "==", currentTeacherId)));
    document.getElementById("statStudents").innerText = studentsSnap.size;
    document.getElementById("statGroups").innerText = groupsSnap.size;
    document.getElementById("statSubjects").innerText = subjectsSnap.size;
  }

  async function loadAllData() {
    await loadGroups();
    await loadMySubjects();
    await loadStudents();
    await loadMyLessons();
    await updateStats();
  }

  // ========== ФУНКЦІЇ ДЛЯ ФІЛЬТРІВ ЖУРНАЛУ ==========
  async function populateJournalFilters() {
    const groupsSnap = await getDocs(collection(db, "groups"));
    const yearsSet = new Set();
    groupsSnap.forEach(g => { const year = g.data().academicYear; if (year) yearsSet.add(year); });
    let yearOptions = '<option value="">Оберіть рік</option>';
    const sortedYears = Array.from(yearsSet).sort((a, b) => { const aStart = parseInt(a.split('/')[0]); const bStart = parseInt(b.split('/')[0]); return bStart - aStart; });
    sortedYears.forEach(year => { yearOptions += `<option value="${year}">${year}</option>`; });
    document.getElementById("journalYearSelect").innerHTML = yearOptions;
    const currentYear = document.getElementById("journalYearSelect").value;
    
    document.getElementById("journalYearSelect").onchange = async () => {
      const selectedYear = document.getElementById("journalYearSelect").value;
      if (!selectedYear) {
        document.getElementById("journalGroupSelect").innerHTML = '<option value="">Оберіть групу</option>';
        document.getElementById("journalSubjectSelect").innerHTML = '<option value="">Оберіть предмет</option>';
        saveLastSelection();
        renderJournal();
        return;
      }
      const groupsSnap2 = await getDocs(query(collection(db, "groups"), where("academicYear", "==", selectedYear)));
      let groupOptions = '<option value="">Оберіть групу</option>';
      const groupsArray = [];
      groupsSnap2.forEach(g => {
        groupOptions += `<option value="${g.id}">${g.data().name}</option>`;
        groupsArray.push({ id: g.id, name: g.data().name });
      });
      document.getElementById("journalGroupSelect").innerHTML = groupOptions;
      document.getElementById("journalSubjectSelect").innerHTML = '<option value="">Оберіть предмет</option>';
      if (groupsArray.length === 1) {
        document.getElementById("journalGroupSelect").value = groupsArray[0].id;
        const groupEvent = new Event('change');
        document.getElementById("journalGroupSelect").dispatchEvent(groupEvent);
      } else {
        saveLastSelection();
        renderJournal();
      }
    };
    
    document.getElementById("journalGroupSelect").onchange = async () => {
      const selectedGroup = document.getElementById("journalGroupSelect").value;
      if (!selectedGroup) {
        document.getElementById("journalSubjectSelect").innerHTML = '<option value="">Оберіть предмет</option>';
        saveLastSelection();
        renderJournal();
        return;
      }
      const groupDoc = await getDoc(doc(db, "groups", selectedGroup));
      const groupName = groupDoc.exists() ? groupDoc.data().name : '';
      const groupYear = groupDoc.exists() ? groupDoc.data().academicYear : '';
      const subjectsSnap = await getDocs(query(collection(db, "subjects"), where("groupId", "==", selectedGroup), where("teacherId", "==", currentTeacherId)));
      let subjectOptions = '<option value="">Оберіть предмет</option>';
      const subjectsArray = [];
      for (const docSnap of subjectsSnap.docs) {
        const s = docSnap.data();
        const displayText = `${s.name} (${groupName} | ${groupYear})`;
        subjectOptions += `<option value="${docSnap.id}">${displayText}</option>`;
        subjectsArray.push({ id: docSnap.id, displayText });
      }
      document.getElementById("journalSubjectSelect").innerHTML = subjectOptions;
      if (subjectsArray.length === 1) document.getElementById("journalSubjectSelect").value = subjectsArray[0].id;
      saveLastSelection();
      renderJournal();
    };
    
    document.getElementById("journalSubjectSelect").onchange = () => {
      saveLastSelection();
      renderJournal();
    };
    
    if (currentYear && currentYear !== "Оберіть рік") {
      const event = new Event('change');
      document.getElementById("journalYearSelect").dispatchEvent(event);
    }
  }

function populateSelects() {
    // Завантажуємо групи для форми студента
    loadGroupsToSelect(document.getElementById("studentGroup"));
    
    // Завантажуємо групи для форми предмета
    loadGroupsToSelect(document.getElementById("subjectGroup"));
    
    // Завантажуємо предмети для фільтрів
    getDocs(query(collection(db, "subjects"), where("teacherId", "==", currentTeacherId))).then(async snap => {
        let opts = '<option value="">Оберіть предмет</option>';
        let filterOpts = '<option value="all">Всі предмети</option>';
        for (const docSnap of snap.docs) {
            const s = docSnap.data();
            let groupName = '', academicYear = '';
            if (s.groupId) {
                const groupDoc = await getDoc(doc(db, "groups", s.groupId));
                if (groupDoc.exists()) {
                    groupName = groupDoc.data().name;
                    academicYear = groupDoc.data().academicYear || '';
                }
            }
            if (!groupName) {
                groupName = s.groupName || 'Групу не обрано';
                academicYear = s.academicYear || '';
            }
            const displayText = `${s.name} (${groupName} | ${academicYear || 'рік не вказано'})`;
            opts += `<option value="${docSnap.id}">${displayText}</option>`;
            filterOpts += `<option value="${docSnap.id}">${displayText}</option>`;
        }
        document.getElementById("lessonSubject").innerHTML = opts;
        document.getElementById("lessonFilterSubject").innerHTML = filterOpts;
    });
    
    populateJournalFilters();
}

  // ========== ГЛОБАЛЬНІ ФУНКЦІЇ WINDOW ==========
  window.logout = async () => {
    await signOut(auth);
    window.location.href = "index.html";
  };

  window.switchTab = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    
    const buttons = document.querySelectorAll('.tab-btn');
    const tabMap = {
      'tab-journal': 0, 'tab-lessons': 1, 'tab-groups': 2, 'tab-students': 3, 'tab-subjects': 4
    };
    if (tabMap[tabId] !== undefined && buttons[tabMap[tabId]]) {
      buttons[tabMap[tabId]].classList.add('active');
    }
    
    saveActiveTab(tabId);
    saveLastSelection();
    
    if (tabId === 'tab-journal') renderJournal();
    if (tabId === 'tab-lessons') loadMyLessons();
  };

  window.openAddLessonForm = function() {
    // Скидаємо форму та стан до режиму "додавання"
    currentEditId = null;
    document.getElementById("lessonTopic").value = "";
    document.getElementById("lessonDate").value = "";
    // Скидаємо кастомний дропдаун розділів
    const sectionHiddenEl = document.getElementById("lessonSection");
    if (sectionHiddenEl) sectionHiddenEl.value = "";
    const sectionDisplayEl = document.getElementById("sectionSelectDisplay");
    if (sectionDisplayEl) sectionDisplayEl.textContent = "Оберіть розділ";
    const sectionDropEl = document.getElementById("sectionDropdown");
    if (sectionDropEl) sectionDropEl.classList.remove("open");
    document.getElementById("newSectionGroup").style.display = "none";
    document.getElementById("newSectionName").value = "";
    const btn = document.getElementById("saveLessonBtn");
    btn.innerText = "Зберегти";
    // Відновлюємо глобальний обробник збереження (міг бути перезаписаний editLesson)
    btn.onclick = window._globalSaveLessonHandler;
    const f = document.getElementById("form-add-lesson");
    if (f) f.style.display = "block";
  };

  window.toggleForm = (formId) => {
    const f = document.getElementById(formId);
    if (f) f.style.display = f.style.display === "none" || f.style.display === "" ? "block" : "none";
    if (currentEditId) currentEditId = null;
  };

  window.deleteItem = async (col, id) => {
    if (confirm("Видалити?")) {
      await deleteDoc(doc(db, col, id));
      if (col === 'groups') loadGroups();
      if (col === 'students') { loadStudents(); loadGroups(); }
      if (col === 'subjects') loadMySubjects();
      if (col === 'lessons') {
        await loadMyLessons();
        await window.updateDeleteAllButton();
        if (typeof refreshSectionsList === 'function') refreshSectionsList();
      }
      updateStats();
      if (document.getElementById("tab-journal").classList.contains("active")) renderJournal();
    }
  };

  // ========== ОБРОБНИКИ ПОДІЙ ==========
  document.addEventListener('click', function(e) {
    // Close section dropdown if click outside
    const wrapper = document.getElementById('sectionSelectWrapper');
    if (wrapper && !wrapper.contains(e.target)) {
      const dropdown = document.getElementById('sectionDropdown');
      if (dropdown) dropdown.classList.remove('open');
    }

    if (currentEditingCell && currentActiveInput) {
      const isClickOnInput = currentActiveInput === e.target || currentActiveInput.contains(e.target);
      const isClickOnCell = currentEditingCell === e.target || currentEditingCell.contains(e.target);
      const isClickOnAnotherCell = e.target.closest('.grade-cell') || e.target.closest('.final-grade-cell');
      if (!isClickOnInput && !isClickOnCell && !isClickOnAnotherCell) {
        saveAndCloseInput(currentActiveInput, currentEditingCell);
      }
    }
  });

  document.getElementById("lessonFilterSubject").addEventListener("change", () => {
    loadMyLessons();
    window.updateDeleteAllButton();
  });

  document.getElementById("deleteAllLessonsBtn").addEventListener("click", window.deleteAllLessonsForSubject);

  // ========== АВТЕНТИФІКАЦІЯ ТА ЗАПУСК ==========
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists() && snap.data().role === "teacher") {
        currentTeacherId = user.uid;
        document.getElementById("userName").textContent = snap.data().displayName || "Викладач";
        document.getElementById("userAvatar").src = snap.data().photoURL || "https://ui-avatars.com/api/?name=" + encodeURIComponent(snap.data().displayName || "Teacher");
        
        // Спочатку відновлюємо вкладку (негайно, без миготіння)
        restoreActiveTab();
        
        // Завантажуємо всі дані
        await loadAllData();
        
        // Відновлюємо останній вибір фільтрів
        restoreLastSelection();
        
        // Якщо активна вкладка "Журнал" - рендеримо журнал з відновленими фільтрами
        if (document.getElementById("tab-journal").classList.contains("active")) {
          await populateJournalFilters();
          const lastYear = sessionStorage.getItem(STORAGE_KEYS.lastYear);
          const lastGroup = sessionStorage.getItem(STORAGE_KEYS.lastGroup);
          const lastSubject = sessionStorage.getItem(STORAGE_KEYS.lastSubject);
          if (lastYear && lastGroup && lastSubject) {
            // Відновлюємо вибір напряму
            const yearSel = document.getElementById("journalYearSelect");
            if (yearSel && yearSel.querySelector(`option[value="${lastYear}"]`)) {
              yearSel.value = lastYear;
              // Populate groups for this year
              const groupsSnap2 = await getDocs(query(collection(db, "groups"), where("academicYear", "==", lastYear)));
              let groupOptions = '<option value="">Оберіть групу</option>';
              groupsSnap2.forEach(g => { groupOptions += `<option value="${g.id}">${g.data().name}</option>`; });
              document.getElementById("journalGroupSelect").innerHTML = groupOptions;
              if (document.querySelector(`#journalGroupSelect option[value="${lastGroup}"]`)) {
                document.getElementById("journalGroupSelect").value = lastGroup;
                // Populate subjects for this group
                const groupDoc2 = await getDoc(doc(db, "groups", lastGroup));
                const gName2 = groupDoc2.exists() ? groupDoc2.data().name : '';
                const gYear2 = groupDoc2.exists() ? groupDoc2.data().academicYear : '';
                const subjSnap2 = await getDocs(query(collection(db, "subjects"), where("groupId", "==", lastGroup), where("teacherId", "==", currentTeacherId)));
                let subjectOptions = '<option value="">Оберіть предмет</option>';
                subjSnap2.forEach(d => { subjectOptions += `<option value="${d.id}">${d.data().name} (${gName2} | ${gYear2})</option>`; });
                document.getElementById("journalSubjectSelect").innerHTML = subjectOptions;
                if (document.querySelector(`#journalSubjectSelect option[value="${lastSubject}"]`)) {
                  document.getElementById("journalSubjectSelect").value = lastSubject;
                }
              }
            }
            renderJournal();
          } else {
            renderJournal();
          }
        }
        
        // Якщо активна вкладка "Заняття" - відновлюємо фільтр
        if (document.getElementById("tab-lessons").classList.contains("active")) {
          const lastLessonFilter = sessionStorage.getItem(STORAGE_KEYS.lastLessonFilter);
          if (lastLessonFilter && document.querySelector(`#lessonFilterSubject option[value="${lastLessonFilter}"]`)) {
            document.getElementById("lessonFilterSubject").value = lastLessonFilter;
          }
          await loadMyLessons();
          await window.updateDeleteAllButton();
        }
      } else {
        window.location.href = "index.html";
      }
    } else {
      window.location.href = "index.html";
    }
  });
