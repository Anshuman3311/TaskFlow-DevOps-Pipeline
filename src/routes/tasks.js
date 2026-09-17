const express = require('express');
const db = require('../db');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { isPositiveInteger, cleanString } = require('../utils/validate');

const router = express.Router();

const VALID_STATUSES = ['pending', 'in-progress', 'done'];
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 1000;

// All task routes require a valid JWT
router.use(authenticate);

function findOwnedTaskOr404(req, res) {
  if (!isPositiveInteger(req.params.id)) {
    res.status(400).json({ error: 'Task id must be a positive integer' });
    return null;
  }
  const task = db.tasks.findById(req.params.id, req.user.id);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return null;
  }
  return task;
}

// List all tasks for the logged-in user
router.get('/', (req, res) => {
  const list = db.tasks.findAllByUser(req.user.id);
  res.json(list);
});

// Get a single task
router.get('/:id', (req, res) => {
  const task = findOwnedTaskOr404(req, res);
  if (!task) {return;}
  res.json(task);
});

// Create a task
router.post('/', (req, res) => {
  const title = cleanString(req.body.title, MAX_TITLE_LENGTH);
  const description = cleanString(req.body.description, MAX_DESCRIPTION_LENGTH);
  const status = req.body.status || 'pending';

  if (!title) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${VALID_STATUSES.join(', ')}` });
  }

  const task = db.tasks.create({ userId: req.user.id, title, description, status });
  logger.info('task created', { userId: req.user.id, taskId: task.id });
  res.status(201).json(task);
});

// Update a task's content (title/description) and, optionally, its status
router.put('/:id', (req, res) => {
  const existing = findOwnedTaskOr404(req, res);
  if (!existing) {return;}

  const title =
    req.body.title !== undefined ? cleanString(req.body.title, MAX_TITLE_LENGTH) : existing.title;
  const description =
    req.body.description !== undefined
      ? cleanString(req.body.description, MAX_DESCRIPTION_LENGTH)
      : existing.description;
  const status = req.body.status !== undefined ? req.body.status : existing.status;

  if (!title) {
    return res.status(400).json({ error: 'title cannot be empty' });
  }
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${VALID_STATUSES.join(', ')}` });
  }

  const updated = db.tasks.update(req.params.id, req.user.id, { title, description, status });
  logger.info('task updated', { userId: req.user.id, taskId: updated.id });
  res.json(updated);
});

// Dedicated endpoint for changing just the status (used by the status pill)
router.patch('/:id/status', (req, res) => {
  const existing = findOwnedTaskOr404(req, res);
  if (!existing) {return;}

  const { status } = req.body;
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of ${VALID_STATUSES.join(', ')}` });
  }

  const updated = db.tasks.update(req.params.id, req.user.id, { status });
  logger.info('task status changed', { userId: req.user.id, taskId: updated.id, status });
  res.json(updated);
});

// Dedicated "mark as completed" convenience endpoint
router.patch('/:id/complete', (req, res) => {
  const existing = findOwnedTaskOr404(req, res);
  if (!existing) {return;}

  const updated = db.tasks.update(req.params.id, req.user.id, { status: 'done' });
  logger.info('task marked complete', { userId: req.user.id, taskId: updated.id });
  res.json(updated);
});

// Reopen a completed task
router.patch('/:id/reopen', (req, res) => {
  const existing = findOwnedTaskOr404(req, res);
  if (!existing) {return;}

  const updated = db.tasks.update(req.params.id, req.user.id, { status: 'pending' });
  logger.info('task reopened', { userId: req.user.id, taskId: updated.id });
  res.json(updated);
});

// Delete a task
router.delete('/:id', (req, res) => {
  const existing = findOwnedTaskOr404(req, res);
  if (!existing) {return;}

  db.tasks.remove(req.params.id, req.user.id);
  logger.info('task deleted', { userId: req.user.id, taskId: existing.id });
  res.status(204).send();
});

module.exports = router;
