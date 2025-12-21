import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    // Default to 'dark' if no preference is saved
    const [theme, setTheme] = useState<Theme>(() => {
        const savedTheme = localStorage.getItem('theme');
        return (savedTheme as Theme) || 'dark';
    });

    useEffect(() => {
        const root = window.document.documentElement;
        // Remove previous theme class/attribute
        root.classList.remove('light', 'dark');
        // Add current theme class for Tailwind
        root.classList.add(theme);
        // Set data-theme attribute for custom CSS
        root.setAttribute('data-theme', theme);
        // Save to localStorage
        localStorage.setItem('theme', theme);
        // Also save to 'darkMode' key for backward compatibility if needed, or just stick to 'theme'
        localStorage.setItem('darkMode', theme === 'dark' ? 'true' : 'false');
    }, [theme]);

    const toggleTheme = () => {
        setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
