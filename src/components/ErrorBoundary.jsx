import React from 'react';

export class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('BioDockify Studio ErrorBoundary caught:', error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    handleReload = () => {
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    height: '100vh', background: '#0f0f0f', color: '#fff', fontFamily: 'system-ui, sans-serif',
                    padding: '2rem', textAlign: 'center'
                }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>Something went wrong</div>
                    <p style={{ color: '#888', maxWidth: '500px', marginBottom: '2rem' }}>
                        {this.state.error?.message || 'An unexpected error occurred. Your recordings are safe.'}
                    </p>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button onClick={this.handleReset} style={{
                            padding: '0.75rem 1.5rem', background: '#8b5cf6', color: '#fff',
                            border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '1rem'
                        }}>
                            Try Again
                        </button>
                        <button onClick={this.handleReload} style={{
                            padding: '0.75rem 1.5rem', background: '#333', color: '#fff',
                            border: '1px solid #555', borderRadius: '8px', cursor: 'pointer', fontSize: '1rem'
                        }}>
                            Reload App
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
