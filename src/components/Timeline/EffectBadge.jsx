import React from 'react';
import './EffectBadge.css';

export const EffectBadge = ({ effects = [], onClick }) => {
    if (!effects || effects.length === 0) return null;

    return (
        <div className="tl-effect-badge" onClick={onClick} title={`${effects.length} effect(s)`}>
            <span className="tl-effect-badge-fx">fx</span>
            {effects.length > 1 && (
                <span className="tl-effect-badge-count">{effects.length}</span>
            )}
        </div>
    );
};
