const fs = require('fs');
const path = require('path');

const isTest = process.env.NODE_ENV === 'test';
const dataDir = path.join(__dirname, '..', '..', 'data');
const dataFile = path.join(dataDir, 'db.json');

function emptyState() {
  return { users: [], tasks: [], nextUserId: 1, nextTaskId: 1 };
}

let state = emptyState();

function load() {
  if (isTest) {return emptyState();} // fresh, in-memory state per test run
  try {
    if (fs.existsSync(dataFile)) {
      return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    }
  } catch (err) {
    console.error('Could not read data file, starting fresh:', err.message);
  }
  return emptyState();
}

function persist() {
  if (isTest) {return;} // never touch disk during tests
  try {
    if (!fs.existsSync(dataDir)) {fs.mkdirSync(dataDir, { recursive: true });}
    fs.writeFileSync(dataFile, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error('Could not persist data file:', err.message);
  }
}

state = load();

// ---------- Users ----------
const users = {
  findByEmail(email) {
    return state.users.find((u) => u.email === email) || null;
  },

  findById(id) {
    return state.users.find((u) => u.id === Number(id)) || null;
  },

  create({ email, password }) {
    const user = {
      id: state.nextUserId++,
      email,
      password,
      created_at: new Date().toISOString(),
    };
    state.users.push(user);
    persist();
    return user;
  },
};

// ---------- Tasks ----------
const tasks = {
  findAllByUser(userId) {
    return state.tasks
      .filter((t) => t.user_id === Number(userId))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  findById(id, userId) {
    return (
      state.tasks.find((t) => t.id === Number(id) && t.user_id === Number(userId)) || null
    );
  },

  create({ userId, title, description, status }) {
    const task = {
      id: state.nextTaskId++,
      user_id: Number(userId),
      title,
      description: description || null,
      status,
      created_at: new Date().toISOString(),
    };
    state.tasks.push(task);
    persist();
    return task;
  },

  update(id, userId, updates) {
    const task = tasks.findById(id, userId);
    if (!task) {return null;}
    Object.assign(task, updates);
    persist();
    return task;
  },

  remove(id, userId) {
    const index = state.tasks.findIndex(
      (t) => t.id === Number(id) && t.user_id === Number(userId)
    );
    if (index === -1) {return false;}
    state.tasks.splice(index, 1);
    persist();
    return true;
  },
};

// Test-only helper so each test file can start clean if it wants to.
function _resetForTests() {
  if (isTest) {state = emptyState();}
}

module.exports = { users, tasks, _resetForTests };
