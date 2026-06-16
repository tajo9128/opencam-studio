// Callout templates — styled annotation boxes (Camtasia-style)
export const CALLOUTS = {
    info: {
        name: 'Info',
        icon: 'ℹ', bg: '#3b82f6', color: '#fff',
        render: (ctx, x, y, text, w = 260) => {
            const h = 56, r = 10, iconSize = 28;
            ctx.save();
            ctx.fillStyle = '#3b82f6';
            ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 22px sans-serif';
            ctx.fillText('ℹ', x + 14, y + 18 + iconSize / 2);
            ctx.font = '14px Outfit, sans-serif';
            ctx.fillText(text?.slice(0, 35) || 'Information', x + 50, y + 34);
            ctx.restore();
        }
    },
    warning: {
        name: 'Warning',
        icon: '⚠', bg: '#f59e0b', color: '#fff',
        render: (ctx, x, y, text, w = 260) => {
            const h = 56, r = 10, iconSize = 28;
            ctx.save();
            ctx.fillStyle = '#f59e0b';
            ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 22px sans-serif';
            ctx.fillText('⚠', x + 14, y + 18 + iconSize / 2);
            ctx.font = '14px Outfit, sans-serif';
            ctx.fillText(text?.slice(0, 35) || 'Warning', x + 50, y + 34);
            ctx.restore();
        }
    },
    tip: {
        name: 'Tip',
        icon: '💡', bg: '#10b981', color: '#fff',
        render: (ctx, x, y, text, w = 260) => {
            const h = 56, r = 10, iconSize = 28;
            ctx.save();
            ctx.fillStyle = '#10b981';
            ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 22px sans-serif';
            ctx.fillText('💡', x + 14, y + 18 + iconSize / 2);
            ctx.font = '14px Outfit, sans-serif';
            ctx.fillText(text?.slice(0, 35) || 'Pro Tip', x + 50, y + 34);
            ctx.restore();
        }
    },
    question: {
        name: 'Question',
        icon: '❓', bg: '#ec4899', color: '#fff',
        render: (ctx, x, y, text, w = 260) => {
            const h = 56, r = 10, iconSize = 28;
            ctx.save();
            ctx.fillStyle = '#ec4899';
            ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 22px sans-serif';
            ctx.fillText('❓', x + 14, y + 18 + iconSize / 2);
            ctx.font = '14px Outfit, sans-serif';
            ctx.fillText(text?.slice(0, 35) || 'Question', x + 50, y + 34);
            ctx.restore();
        }
    },
    highlight: {
        name: 'Highlight',
        icon: '★', bg: '#8b5cf6', color: '#fff',
        render: (ctx, x, y, text, w = 260) => {
            const h = 56, r = 10, iconSize = 28;
            ctx.save();
            ctx.fillStyle = '#8b5cf6';
            ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 22px sans-serif';
            ctx.fillText('★', x + 14, y + 18 + iconSize / 2);
            ctx.font = '14px Outfit, sans-serif';
            ctx.fillText(text?.slice(0, 35) || 'Key Point', x + 50, y + 34);
            ctx.restore();
        }
    },
    arrow: {
        name: 'Arrow',
        icon: '→', bg: '#6366f1', color: '#fff',
        render: (ctx, x, y, text, w = 200) => {
            const h = 44, r = 8, iconSize = 24;
            ctx.save();
            ctx.fillStyle = '#6366f1';
            ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 20px sans-serif';
            ctx.fillText('→', x + 10, y + 14 + iconSize / 2);
            ctx.font = '12px Outfit, sans-serif';
            ctx.fillText(text?.slice(0, 30) || 'Click here', x + 40, y + 28);
            ctx.restore();
        }
    },
};

export const CALLOUT_TYPES = Object.entries(CALLOUTS).map(([id, c]) => ({ id, name: c.name, icon: c.icon }));
