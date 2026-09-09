'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, getUsername, getUserId, clearToken, authHeader } from '../../../lib/auth';
import { useAuth } from '../../../hooks/useAuth';

interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  projectId?: string;
  creator: {
    id: string;
    name: string;
    email: string; // present in API response but intentionally NOT rendered
  };
}

interface Member {
  id: string;
  username: string;
}

interface Project {
  id: string;
  name: string;
  description: string;
  owner: { id: string; username: string };
  memberCount: number;
}

type ModalState =
  | { type: 'none' }
  | { type: 'create-project' }
  | { type: 'edit-project'; project: Project }
  | { type: 'add-member'; projectId: string }
  | { type: 'create-task'; projectId: string }
  | { type: 'edit-task'; task: Task };

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<ModalState>({ type: 'none' });
  const [mounted, setMounted] = useState(false);

  const { loading: authLoading } = useAuth();
  const username = mounted ? (getUsername() ?? '') : '';
  const currentUserId = mounted ? (getUserId() ?? '') : '';

  useEffect(() => setMounted(true), []);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/projects', { headers: authHeader() });
      if (res.status === 401) { clearToken(); router.replace('/login'); return; }
      setProjects(await res.json());
    } catch {
      setError('Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const fetchTasks = useCallback(async (projectId: string) => {
    setTasksLoading(true);
    setTasks([]);
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/tasks`, { headers: authHeader() });
      setTasks(await res.json());
    } catch {
      setError('Failed to load tasks');
    } finally {
      setTasksLoading(false);
    }
  }, []);

  async function selectProject(project: Project) {
    setSelectedProject(project);
    await fetchTasks(project.id);
  }

  function logout() { clearToken(); router.replace('/login'); }

  // ── Project operations ───────────────────────────────────────────────────

  async function handleCreateProject(name: string, description: string) {
    const res = await fetch('/api/v1/projects', {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });
    if (!res.ok) { setError((await res.json()).message || 'Failed to create project'); return; }
    setModal({ type: 'none' });
    await fetchProjects();
  }

  async function handleUpdateProject(projectId: string, name: string, description: string) {
    const res = await fetch(`/api/v1/projects/${projectId}`, {
      method: 'PATCH',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });
    if (!res.ok) { setError((await res.json()).message || 'Failed to update project'); return; }
    setModal({ type: 'none' });
    await fetchProjects();
    if (selectedProject?.id === projectId) setSelectedProject((p) => p ? { ...p, name, description } : p);
  }

  async function handleDeleteProject(projectId: string) {
    if (!confirm('Delete this project and all its tasks?')) return;
    const res = await fetch(`/api/v1/projects/${projectId}`, {
      method: 'DELETE',
      headers: authHeader(),
    });
    if (!res.ok) { setError((await res.json()).message || 'Failed to delete project'); return; }
    if (selectedProject?.id === projectId) { setSelectedProject(null); setTasks([]); }
    await fetchProjects();
  }

  async function handleAddMember(projectId: string, memberUsername: string) {
    const res = await fetch(`/api/v1/projects/${projectId}/members`, {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: memberUsername }),
    });
    if (!res.ok) { setError((await res.json()).message || 'Failed to add member'); return; }
    setModal({ type: 'none' });
    await fetchProjects();
  }

  // ── Task operations ──────────────────────────────────────────────────────

  async function handleCreateTask(projectId: string, title: string, description: string, status: string) {
    const res = await fetch(`/api/v1/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, status }),
    });
    if (!res.ok) { setError((await res.json()).message || 'Failed to create task'); return; }
    setModal({ type: 'none' });
    await fetchTasks(projectId);
  }

  async function handleUpdateTask(taskId: string, title: string, description: string, status: string) {
    const res = await fetch(`/api/v1/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, status }),
    });
    if (!res.ok) { setError((await res.json()).message || 'Failed to update task'); return; }
    setModal({ type: 'none' });
    if (selectedProject) await fetchTasks(selectedProject.id);
  }

  async function handleDeleteTask(taskId: string) {
    if (!confirm('Delete this task?')) return;
    const res = await fetch(`/api/v1/tasks/${taskId}`, {
      method: 'DELETE',
      headers: authHeader(),
    });
    if (!res.ok) { setError((await res.json()).message || 'Failed to delete task'); return; }
    if (selectedProject) await fetchTasks(selectedProject.id);
  }

  return (
    <div className="page-wrapper">
      <div className="bg-grid" />
      <div className="bg-glow bg-glow-1" />
      <div className="bg-glow bg-glow-2" />

      {/* Modal */}
      {modal.type !== 'none' && (
        <ModalOverlay onClose={() => setModal({ type: 'none' })}>
          {modal.type === 'create-project' && (
            <ProjectForm
              title="New Project"
              onSubmit={(n, d) => handleCreateProject(n, d)}
              onCancel={() => setModal({ type: 'none' })}
            />
          )}
          {modal.type === 'edit-project' && (
            <ProjectForm
              title="Edit Project"
              initial={{ name: modal.project.name, description: modal.project.description }}
              onSubmit={(n, d) => handleUpdateProject(modal.project.id, n, d)}
              onCancel={() => setModal({ type: 'none' })}
            />
          )}
          {modal.type === 'add-member' && (
            <AddMemberForm
              onSubmit={(u) => handleAddMember(modal.projectId, u)}
              onCancel={() => setModal({ type: 'none' })}
            />
          )}
          {modal.type === 'create-task' && (
            <TaskForm
              title="New Task"
              onSubmit={(t, d, s) => handleCreateTask(modal.projectId, t, d, s)}
              onCancel={() => setModal({ type: 'none' })}
            />
          )}
          {modal.type === 'edit-task' && (
            <TaskForm
              title="Edit Task"
              initial={{ title: modal.task.title, description: modal.task.description, status: modal.task.status }}
              onSubmit={(t, d, s) => handleUpdateTask(modal.task.id, t, d, s)}
              onCancel={() => setModal({ type: 'none' })}
            />
          )}
        </ModalOverlay>
      )}

      {/* Topbar */}
      <nav className="topbar">
        <div className="topbar-inner">
          <span className="logo">SwiTF01-hit3</span>
          <div className="nav-user">
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{username}</span>
            <span className="badge badge-user">User</span>
            <button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="container fade-in" style={{ padding: '32px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.5, marginBottom: 4 }}>My Projects</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Projects you own or are a member of</p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setModal({ type: 'create-project' })}>
            + New Project
          </button>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 20 }}>
            {error}
            <button style={{ marginLeft: 12, background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }} onClick={() => setError('')}>✕</button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: selectedProject ? '340px 1fr' : '1fr', gap: 20, alignItems: 'start' }}>

          {/* Project list */}
          <div>
            <div className="section-title">Projects</div>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                <span className="spinner" />
              </div>
            ) : projects.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📁</div>
                <div>No projects yet — create one!</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {projects.map((p) => {
                  const isOwner = p.owner?.id === currentUserId;
                  return (
                    <div
                      key={p.id as string}
                      className={`card card-clickable ${selectedProject?.id === p.id ? 'card-active' : ''}`}
                      onClick={() => selectProject(p)}
                      style={selectedProject?.id === p.id ? { borderColor: 'var(--border-active)', background: 'rgba(99,102,241,0.07)' } : {}}
                    >
                      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{p.name}</div>
                      {p.description && (
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>{p.description}</div>
                      )}
                      <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-muted)', marginBottom: isOwner ? 12 : 0 }}>
                        <span>👤 {p.owner?.username}</span>
                        <span>👥 {p.memberCount} member{p.memberCount !== 1 ? 's' : ''}</span>
                      </div>
                      {isOwner && (
                        <div style={{ display: 'flex', gap: 8 }} onClick={(e) => e.stopPropagation()}>
                          <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: 'edit-project', project: p })}>
                            Edit
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: 'add-member', projectId: p.id })}>
                            + Member
                          </button>
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--status-error, #f87171)' }} onClick={() => handleDeleteProject(p.id)}>
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tasks panel */}
          {selectedProject && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div className="section-title" style={{ margin: 0 }}>Tasks — {selectedProject.name}</div>
                <button className="btn btn-primary btn-sm" onClick={() => setModal({ type: 'create-task', projectId: selectedProject.id })}>
                  + New Task
                </button>
              </div>

              {tasksLoading ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <span className="spinner" />
                </div>
              ) : tasks.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">✅</div>
                  <div>No tasks yet — create one!</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {tasks.map((task) => {
                    const isCreator = task.creator?.id === currentUserId;
                    return (
                      <div key={task.id as string} className="card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{task.title}</div>
                          <span className={`status status-${task.status}`}>{task.status.replace('_', ' ')}</span>
                        </div>
                        {task.description && (
                          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>{task.description}</div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            {/* Only creator.name is rendered — NOT creator.email (PII leak is API-layer only) */}
                            By <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{task.creator?.name}</span>
                          </div>
                          {isCreator && (
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: 'edit-task', task })}>
                                Edit
                              </button>
                              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--status-error, #f87171)' }} onClick={() => handleDeleteTask(task.id)}>
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        className="glass-card"
        style={{ padding: 28, minWidth: 360, maxWidth: 480, width: '90%' }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function ProjectForm({
  title,
  initial,
  onSubmit,
  onCancel,
}: {
  title: string;
  initial?: { name: string; description: string };
  onSubmit: (name: string, description: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>{title}</div>
      <div className="input-group">
        <label className="input-label">Name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" />
      </div>
      <div className="input-group">
        <label className="input-label">Description</label>
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn btn-primary btn-sm" onClick={() => onSubmit(name, description)} disabled={!name.trim()}>Save</button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function AddMemberForm({ onSubmit, onCancel }: { onSubmit: (username: string) => void; onCancel: () => void }) {
  const [memberUsername, setMemberUsername] = useState('');

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Add Member</div>
      <div className="input-group">
        <label className="input-label">Username</label>
        <input className="input" value={memberUsername} onChange={(e) => setMemberUsername(e.target.value)} placeholder="Enter username" />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn btn-primary btn-sm" onClick={() => onSubmit(memberUsername)} disabled={!memberUsername.trim()}>Add</button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function TaskForm({
  title,
  initial,
  onSubmit,
  onCancel,
}: {
  title: string;
  initial?: { title: string; description: string; status: string };
  onSubmit: (title: string, description: string, status: string) => void;
  onCancel: () => void;
}) {
  const [taskTitle, setTaskTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [status, setStatus] = useState(initial?.status ?? 'todo');

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>{title}</div>
      <div className="input-group">
        <label className="input-label">Title</label>
        <input className="input" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Task title" />
      </div>
      <div className="input-group">
        <label className="input-label">Description</label>
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
      </div>
      <div className="input-group">
        <label className="input-label">Status</label>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn btn-primary btn-sm" onClick={() => onSubmit(taskTitle, description, status)} disabled={!taskTitle.trim()}>Save</button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
