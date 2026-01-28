'use client';

import { useState, useMemo } from 'react';

interface CountiesDropdownProps {
  counties: string[];
}

interface GroupedCounties {
  [letter: string]: string[];
}

export default function CountiesDropdown({ counties }: CountiesDropdownProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  // Group counties by their first letter
  const groupedCounties = useMemo(() => {
    const groups: GroupedCounties = {};
    
    // Sort counties alphabetically first
    const sortedCounties = [...counties].sort((a, b) => a.localeCompare(b));
    
    sortedCounties.forEach((county) => {
      const firstLetter = county.charAt(0).toUpperCase();
      if (!groups[firstLetter]) {
        groups[firstLetter] = [];
      }
      groups[firstLetter].push(county);
    });
    
    return groups;
  }, [counties]);

  // Get sorted letters
  const sortedLetters = useMemo(() => {
    return Object.keys(groupedCounties).sort();
  }, [groupedCounties]);

  const toggleExpanded = () => {
    setIsExpanded(prev => !prev);
  };

  return (
    <div className="counties-accordion">
      {/* Accordion Header/Trigger */}
      <button
        type="button"
        className={`counties-accordion__header ${isExpanded ? 'counties-accordion__header--expanded' : ''}`}
        onClick={toggleExpanded}
        aria-expanded={isExpanded}
      >
        <div className="counties-accordion__header-content">
          <span className="counties-accordion__title">Counties Within Our Service Area</span>
          <span className="counties-accordion__count">{counties.length} Counties</span>
        </div>
        <div className={`counties-accordion__icon ${isExpanded ? 'counties-accordion__icon--expanded' : ''}`}>
          <svg 
            width="24" 
            height="24" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6,9 12,15 18,9"></polyline>
          </svg>
        </div>
      </button>

      {/* Accordion Content Panel */}
      {isExpanded && (
        <div className="counties-accordion__panel">
          {sortedLetters.map((letter) => (
            <div key={letter} className="counties-accordion__letter-group">
              {/* Big Letter Header */}
              <div className="counties-accordion__letter-header">
                <span className="counties-accordion__big-letter">{letter}</span>
              </div>
              
              {/* Counties Grid for this letter */}
              <ul className="counties-accordion__list">
                {groupedCounties[letter].map((county) => (
                  <li key={county} className="counties-accordion__item">
                    <span className="counties-accordion__diamond">◆</span>
                    <span className="counties-accordion__county-name">{county}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}