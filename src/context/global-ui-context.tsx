import React, { createContext, useContext, useState } from 'react';
import { GlobalAddModal, AddOption } from '../components/add-menu';
import { SettingsModal } from '../components/settings-modal';

type GlobalUiContextValue = {
    openAddMenu: () => void;
    openSettings: () => void;
};

const GlobalUiContext = createContext<GlobalUiContextValue | undefined>(undefined);

export function GlobalUiProvider({
    children,
    onAddSelect
}: {
    children: React.ReactNode;
    onAddSelect: (option: AddOption) => void;
}) {
    const [addMenuVisible, setAddMenuVisible] = useState(false);
    const [settingsVisible, setSettingsVisible] = useState(false);

    const value = {
        openAddMenu: () => setAddMenuVisible(true),
        openSettings: () => setSettingsVisible(true),
    };

    return (
        <GlobalUiContext.Provider value={value}>
            {children}
            <GlobalAddModal
                visible={addMenuVisible}
                onClose={() => setAddMenuVisible(false)}
                onSelect={(option) => {
                    setAddMenuVisible(false);
                    onAddSelect(option);
                }}
            />
            <SettingsModal
                visible={settingsVisible}
                onClose={() => setSettingsVisible(false)}
            />
        </GlobalUiContext.Provider>
    );
}

export function useGlobalUi() {
    const context = useContext(GlobalUiContext);
    if (!context) {
        throw new Error('useGlobalUi must be used within GlobalUiProvider');
    }
    return context;
}
