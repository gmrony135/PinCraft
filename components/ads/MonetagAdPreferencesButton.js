'use client';

const PREFERENCES_EVENT = 'pincraft:manage-monetag-preferences';

export default function MonetagAdPreferencesButton() {
  const openPreferences = () => {
    window.dispatchEvent(new Event(PREFERENCES_EVENT));
  };

  return (
    <button type="button" onClick={openPreferences} className="btn-outline min-h-10 px-4 text-xs">
      Manage ad preferences
    </button>
  );
}
