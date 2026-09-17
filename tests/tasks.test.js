process.env.NODE_ENV = 'test';
const request = require('supertest');
const app = require('../src/app');

describe('Task endpoints', () => {
  let token;
  let taskId;

  beforeAll(async () => {
    const email = `taskuser${Date.now()}@example.com`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'password123' });
    token = res.body.token;
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/tasks');
    expect(res.status).toBe(401);
  });

  it('creates a task', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Write Jenkinsfile', description: 'Add all 7 stages' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Write Jenkinsfile');
    expect(res.body.status).toBe('pending');
    taskId = res.body.id;
  });

  it('rejects a task without a title', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'missing title' });
    expect(res.status).toBe(400);
  });

  it('rejects a task with a whitespace-only title', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '   ' });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid status value', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Bad status', status: 'archived' });
    expect(res.status).toBe(400);
  });

  it('lists tasks for the user', async () => {
    const res = await request(app)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('updates a task via PUT', async () => {
    const res = await request(app)
      .put(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Write Jenkinsfile (updated)' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Write Jenkinsfile (updated)');
  });

  it('changes status via the dedicated status endpoint', async () => {
    const res = await request(app)
      .patch(`/api/tasks/${taskId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'in-progress' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('in-progress');
  });

  it('marks a task as completed', async () => {
    const res = await request(app)
      .patch(`/api/tasks/${taskId}/complete`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
  });

  it('reopens a completed task', async () => {
    const res = await request(app)
      .patch(`/api/tasks/${taskId}/reopen`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
  });

  it('rejects a non-numeric task id', async () => {
    const res = await request(app)
      .get('/api/tasks/not-a-number')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('returns 404 for a nonexistent task', async () => {
    const res = await request(app)
      .get('/api/tasks/999999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('deletes a task', async () => {
    const res = await request(app)
      .delete(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('confirms the task is gone', async () => {
    const res = await request(app)
      .get(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
