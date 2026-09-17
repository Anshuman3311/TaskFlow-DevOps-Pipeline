(() => {
  const STATUS_ORDER = ['pending', 'in-progress', 'done'];
  const STATUS_LABEL = {
    pending: 'Pending',
    'in-progress': 'In progress',
    done: 'Done',
  };

  const authScreen = document.getElementById('auth-screen');
  const dashboard = document.getElementById('dashboard');

  const authTabs = document.querySelectorAll('.auth-tab');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const loginError = document.getElementById('login-error');
  const registerError = document.getElementById('register-error');

  const userEmailEl = document.getElementById('user-email');
  const signoutBtn = document.getElementById('signout-btn');
  const newTaskForm = document.getElementById('new-task-form');
  const newTaskTitle = document.getElementById('new-task-title');
  const taskListEl = document.getElementById('task-list');
  const emptyStateEl = document.getElementById('empty-state');

  // ---------- Auth tab switching ----------
  authTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      authTabs.forEach((t) => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      const target = tab.dataset.tab;
      loginForm.classList.toggle('is-hidden', target !== 'login');
      registerForm.classList.toggle('is-hidden', target !== 'register');
      loginError.textContent = '';
      registerError.textContent = '';
    });
  });

  // ---------- Session helpers ----------
  function saveSession(token, email) {
    localStorage.setItem('taskflow_token', token);
    localStorage.setItem('taskflow_email', email);
  }

  function clearSession() {
    localStorage.removeItem('taskflow_token');
    localStorage.removeItem('taskflow_email');
  }

  function getToken() {
    return localStorage.getItem('taskflow_token');
  }

  function showDashboard() {
    authScreen.classList.add('is-hidden');
    dashboard.classList.remove('is-hidden');
    userEmailEl.textContent = localStorage.getItem('taskflow_email') || '';
    loadTasks();
  }

  function showAuthScreen() {
    dashboard.classList.add('is-hidden');
    authScreen.classList.remove('is-hidden');
  }

  // ---------- API helper ----------
  async function api(path, options = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(path, { ...options, headers });

    if (res.status === 401) {
      clearSession();
      showAuthScreen();
      throw new Error('Session expired. Please sign in again.');
    }

    if (res.status === 204) return null;

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong');
    return data;
  }

  // ---------- Auth form handlers ----------
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      saveSession(data.token, data.user.email);
      loginForm.reset();
      showDashboard();
    } catch (err) {
      loginError.textContent = err.message;
    }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    registerError.textContent = '';
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;

    try {
      const data = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      saveSession(data.token, data.user.email);
      registerForm.reset();
      showDashboard();
    } catch (err) {
      registerError.textContent = err.message;
    }
  });

  signoutBtn.addEventListener('click', async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      // Even if the call fails (e.g. token already expired), still clear
      // the local session so the user isn't stuck.
      console.error(err);
    }
    clearSession();
    showAuthScreen();
  });

  // ---------- Task rendering ----------
  function renderTasks(tasks) {
    taskListEl.innerHTML = '';
    emptyStateEl.classList.toggle('is-hidden', tasks.length > 0);

    tasks.forEach((task) => {
      const row = document.createElement('div');
      row.className = 'task-row';
      row.dataset.status = task.status;
      row.dataset.id = task.id;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'complete-checkbox';
      checkbox.checked = task.status === 'done';
      checkbox.title = task.status === 'done' ? 'Mark as not done' : 'Mark as completed';
      checkbox.addEventListener('change', () => toggleComplete(task, checkbox.checked));

      const main = document.createElement('div');
      main.className = 'task-main';

      const title = document.createElement('p');
      title.className = 'task-title';
      title.textContent = task.title;
      main.appendChild(title);

      if (task.description) {
        const desc = document.createElement('p');
        desc.className = 'task-desc';
        desc.textContent = task.description;
        main.appendChild(desc);
      }

      const meta = document.createElement('p');
      meta.className = 'task-meta';
      meta.textContent = `#${task.id} · created ${new Date(task.created_at).toLocaleDateString()}`;
      main.appendChild(meta);

      const statusBtn = document.createElement('button');
      statusBtn.type = 'button';
      statusBtn.className = 'status-pill';
      statusBtn.dataset.status = task.status;
      statusBtn.textContent = STATUS_LABEL[task.status];
      statusBtn.title = 'Click to change status';
      statusBtn.addEventListener('click', () => cycleStatus(task));

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'delete-btn';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => deleteTask(task.id));

      row.appendChild(checkbox);
      row.appendChild(main);
      row.appendChild(statusBtn);
      row.appendChild(deleteBtn);
      taskListEl.appendChild(row);
    });
  }

  async function loadTasks() {
    try {
      const tasks = await api('/api/tasks');
      renderTasks(tasks);
    } catch (err) {
      // If session expired, api() already redirected to the auth screen.
      console.error(err);
    }
  }

  newTaskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = newTaskTitle.value.trim();
    if (!title) return;

    try {
      await api('/api/tasks', { method: 'POST', body: JSON.stringify({ title }) });
      newTaskTitle.value = '';
      loadTasks();
    } catch (err) {
      console.error(err);
    }
  });

  async function cycleStatus(task) {
    const nextIndex = (STATUS_ORDER.indexOf(task.status) + 1) % STATUS_ORDER.length;
    const nextStatus = STATUS_ORDER[nextIndex];
    try {
      await api(`/api/tasks/${task.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      loadTasks();
    } catch (err) {
      console.error(err);
    }
  }

  async function toggleComplete(task, isNowChecked) {
    const endpoint = isNowChecked ? 'complete' : 'reopen';
    try {
      await api(`/api/tasks/${task.id}/${endpoint}`, { method: 'PATCH' });
      loadTasks();
    } catch (err) {
      console.error(err);
    }
  }

  async function deleteTask(id) {
    try {
      await api(`/api/tasks/${id}`, { method: 'DELETE' });
      loadTasks();
    } catch (err) {
      console.error(err);
    }
  }

  // ---------- Boot ----------
  if (getToken()) {
    showDashboard();
  } else {
    showAuthScreen();
  }
})();
