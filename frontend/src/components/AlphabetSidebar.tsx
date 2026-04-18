import React from 'react';
import './AlphabetSidebar.css';

interface AlphabetSidebarProps {
  currentLetter: string;
  onLetterClick: (letter: string) => void;
}

const AlphabetSidebar: React.FC<AlphabetSidebarProps> = ({
  currentLetter,
  onLetterClick,
}) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  return (
    <div className="alphabet-sidebar">
      {alphabet.map((letter) => (
        <span
          key={letter}
          className={`alphabet-item ${currentLetter === letter ? 'active' : ''}`}
          onClick={() => onLetterClick(letter)}
        >
          {letter}
        </span>
      ))}
    </div>
  );
};

export default AlphabetSidebar;
