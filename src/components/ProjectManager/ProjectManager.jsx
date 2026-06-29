import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './ProjectManager.css';

export default function ProjectManager() {
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newName, setNewName] = useState('');
    const navigate = useNavigate();

    const loadProjects = useCallback(async () => {
        try {
            const res = await fetch('/api/projects');
            if (res.ok) setProjects(await res.json());
        } catch (e) {
            console.error('Failed to load projects', e);
        }
        setLoading(false);
    }, []);

    useEffect(() => { loadProjects(); }, [loadProjects]);

    const createProject = async () => {
        const name = newName.trim() || `Project ${Date.now()}`;
        try {
            const res = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            });
            if (res.ok) {
                const project = await res.json();
                navigate(`/editor/${project.id}`);
            }
        } catch (e) {
            console.error('Failed to create project', e);
        }
    };

    const deleteProject = async (id, e) => {
        e.stopPropagation();
        if (!window.confirm('Delete this project?')) return;
        await fetch(`/api/projects/${id}`, { method: 'DELETE' });
        loadProjects();
    };

    return (
        <div className="project-manager">
            <div className="pm-header">
                <h1>OpenCam Studio</h1>
                <p className="pm-subtitle">Video editing projects</p>
            </div>

            <div className="pm-actions">
                <input
                    type="text"
                    className="pm-input"
                    placeholder="Project name..."
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && createProject()}
                />
                <button className="btn btn-primary" onClick={createProject}>New Project</button>
            </div>

            {loading ? (
                <div className="pm-loading">Loading projects...</div>
            ) : projects.length === 0 ? (
                <div className="pm-empty">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    <p>No projects yet. Create one to get started.</p>
                </div>
            ) : (
                <div className="pm-grid">
                    {projects.map(p => (
                        <div key={p.id} className="pm-card" onClick={() => navigate(`/editor/${p.id}`)}>
                            <div className="pm-card-thumb">
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5">
                                    <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                                </svg>
                            </div>
                            <div className="pm-card-name">{p.name}</div>
                            <div className="pm-card-meta">{new Date(p.updatedAt).toLocaleDateString()}</div>
                            <button className="pm-delete-btn" onClick={e => deleteProject(p.id, e)} title="Delete">×</button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
