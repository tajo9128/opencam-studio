import React, { useState } from 'react';
import { FILTERS, getDefaultParams, getFilterList } from '../../utils/FilterEngine';
import './FilterPanel.css';

export const FilterPanel = ({ isOpen, onClose, activeFilters, setActiveFilters }) => {
    const [selectedFilter, setSelectedFilter] = useState(null);
    const filterList = getFilterList();

    if (!isOpen) return null;

    const addFilter = (filterId) => {
        if (activeFilters.find(f => f.filterId === filterId)) return;
        setActiveFilters(prev => [...prev, {
            filterId,
            params: getDefaultParams(filterId)
        }]);
        setSelectedFilter(filterId);
    };

    const removeFilter = (filterId) => {
        setActiveFilters(prev => prev.filter(f => f.filterId !== filterId));
        if (selectedFilter === filterId) setSelectedFilter(null);
    };

    const updateParam = (filterId, paramKey, value) => {
        setActiveFilters(prev => prev.map(f => {
            if (f.filterId !== filterId) return f;
            return { ...f, params: { ...f.params, [paramKey]: value } };
        }));
    };

    const currentFilter = selectedFilter ? activeFilters.find(f => f.filterId === selectedFilter) : null;
    const currentFilterDef = selectedFilter ? FILTERS[selectedFilter] : null;

    return (
        <div className="filter-panel">
            <div className="filter-panel-header">
                <h3>Filters</h3>
                <button className="btn-icon-bg" onClick={onClose}>x</button>
            </div>

            <div className="filter-panel-body">
                <div className="filter-list">
                    <div className="filter-section-title">Available Filters</div>
                    {filterList.map(f => {
                        const isActive = activeFilters.some(af => af.filterId === f.id);
                        return (
                            <button
                                key={f.id}
                                className={`filter-item ${isActive ? 'active' : ''} ${selectedFilter === f.id ? 'selected' : ''}`}
                                onClick={() => isActive ? setSelectedFilter(f.id) : addFilter(f.id)}
                            >
                                <span className="filter-item-icon">{f.icon}</span>
                                <span className="filter-item-name">{f.name}</span>
                                {isActive && (
                                    <button
                                        className="filter-item-remove"
                                        onClick={(e) => { e.stopPropagation(); removeFilter(f.id); }}
                                        title="Remove"
                                    >x</button>
                                )}
                            </button>
                        );
                    })}
                </div>

                {currentFilter && currentFilterDef && (
                    <div className="filter-params">
                        <div className="filter-section-title">
                            {currentFilterDef.name}
                        </div>
                        {Object.entries(currentFilterDef.params).map(([paramKey, paramDef]) => (
                            <div key={paramKey} className="filter-param">
                                <label>{paramKey}</label>
                                {paramDef.type === 'toggle' ? (
                                    <button
                                        className={`btn-pill ${currentFilter.params[paramKey] ? 'active' : ''}`}
                                        onClick={() => updateParam(selectedFilter, paramKey, !currentFilter.params[paramKey])}
                                    >
                                        {currentFilter.params[paramKey] ? 'On' : 'Off'}
                                    </button>
                                ) : paramDef.type === 'color' ? (
                                    <input
                                        type="color"
                                        value={currentFilter.params[paramKey] || paramDef.default}
                                        onChange={(e) => updateParam(selectedFilter, paramKey, e.target.value)}
                                        className="filter-color-input"
                                    />
                                ) : (
                                    <div className="filter-slider-row">
                                        <input
                                            type="range"
                                            min={paramDef.min}
                                            max={paramDef.max}
                                            step={paramDef.step || 1}
                                            value={currentFilter.params[paramKey] ?? paramDef.default}
                                            onChange={(e) => updateParam(selectedFilter, paramKey, Number(e.target.value))}
                                            className="filter-slider"
                                        />
                                        <span className="filter-slider-value">
                                            {currentFilter.params[paramKey] ?? paramDef.default}
                                        </span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
