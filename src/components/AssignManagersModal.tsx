import { Users } from 'lucide-react';
import React, { useState } from 'react';
import { User } from '../types';

interface AssignManagersModalProps {
  open: boolean;
  employee: User;
  eligibleManagers: User[];
  onSave: (managerIds: string[]) => void;
  onCancel: () => void;
}

export const AssignManagersModal: React.FC<AssignManagersModalProps> = ({
  open,
  employee,
  eligibleManagers,
  onSave,
  onCancel,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>(employee.manager_ids);

  if (!open) return null;

  const toggle = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-5 max-w-md w-full shadow-xl border border-zinc-200">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-zinc-100 text-zinc-600 flex items-center justify-center border border-zinc-200 shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-900">Assign Managers</h3>
            <p className="text-xs text-zinc-500 mt-1">
              Choose who can review and approve leave requests for {employee.full_name}.
            </p>
          </div>
        </div>

        <div className="mt-4 max-h-64 overflow-y-auto border border-zinc-200 rounded-xl divide-y divide-zinc-100">
          {eligibleManagers.length === 0 ? (
            <div className="p-3 text-xs text-zinc-400">No eligible managers available.</div>
          ) : (
            eligibleManagers.map((m) => (
              <label
                key={m.id}
                className="flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(m.id)}
                  onChange={() => toggle(m.id)}
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                <span className="font-semibold text-zinc-900">{m.full_name}</span>
                <span className="text-zinc-400">({m.role})</span>
              </label>
            ))
          )}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2 text-xs font-semibold">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 rounded-lg cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(selectedIds)}
            className="px-4 py-1.5 rounded-lg text-white bg-zinc-900 hover:bg-zinc-800 cursor-pointer"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
