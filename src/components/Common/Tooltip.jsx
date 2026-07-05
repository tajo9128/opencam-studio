import React, { useState, useRef } from 'react';
import './Tooltip.css';

export const Tooltip = ({ text, children, position = 'right' }) => {
    const [visible, setVisible] = useState(false);
    const timeoutRef = useRef(null);

    const show = () => {
        timeoutRef.current = setTimeout(() => setVisible(true), 500);
    };

    const hide = () => {
        clearTimeout(timeoutRef.current);
        setVisible(false);
    };

    return (
        <div className="tooltip-wrapper" onMouseEnter={show} onMouseLeave={hide}>
            {children}
            {visible && (
                <div className={`tooltip-box tooltip-${position}`}>
                    {text}
                </div>
            )}
        </div>
    );
};
