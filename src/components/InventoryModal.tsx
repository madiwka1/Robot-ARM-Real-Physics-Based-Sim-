import React, { useState } from 'react';
import { Plus, RotateCcw, X } from 'lucide-react';
import { inventoryMassKg, LAB_INVENTORY, type InventoryItem } from '../robotics/labInventory';

interface InventoryModalProps {
  open: boolean;
  onClose: () => void;
  /** Returns false when there is no free reachable spot left on the bench. */
  onAddItem: (item: InventoryItem) => boolean;
  onRestoreDefaults: () => void;
}

const KIND_LABEL: Record<InventoryItem['kind'], string> = {
  cube: 'Blocks & cubes',
  cylinder: 'Cylinders & labware',
  sphere: 'Balls',
  bottle: 'Bottles',
};

const sizeLabel = (item: InventoryItem) => {
  const [a, b, c] = item.dimensions.map((v) => Math.round(v * 1000));
  if (item.kind === 'cube') return `${a}×${b}×${c} mm`;
  if (item.kind === 'sphere') return `Ø${a * 2} mm`;
  return `Ø${a * 2}×${b} mm`;
};

export const InventoryModal: React.FC<InventoryModalProps> = ({ open, onClose, onAddItem, onRestoreDefaults }) => {
  const [message, setMessage] = useState<string | null>(null);
  if (!open) return null;

  const groups = (Object.keys(KIND_LABEL) as InventoryItem['kind'][]).map((kind) => ({
    kind,
    items: LAB_INVENTORY.filter((i) => i.kind === kind),
  }));

  return (
    <div role="dialog" aria-modal="true" aria-label="Lab Item Inventory" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-white/15 bg-[#141820] p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Lab Item Inventory</h2>
            <p className="text-[11px] text-slate-500">Real sizes & materials · mass = density × volume · placed at a free reachable spot</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close Inventory" className="cursor-pointer rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 space-y-4 text-xs">
          {groups.map((g) => (
            <section key={g.kind}>
              <h3 className="mb-1.5 font-semibold text-slate-300">{KIND_LABEL[g.kind]}</h3>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {g.items.map((item) => (
                  <div key={item.templateId} className="flex items-center gap-2 rounded border border-white/10 bg-[#1a202b] px-2 py-1.5">
                    <span className="h-6 w-6 shrink-0 rounded-sm border border-white/10" style={{ backgroundColor: item.color }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-slate-200">{item.name}</div>
                      <div className="truncate font-mono-tabular text-[11px] tabular-nums text-slate-500">
                        {sizeLabel(item)} · {(inventoryMassKg(item) * 1000).toFixed(0)} g · {item.material}
                      </div>
                      {item.note && <div className="truncate text-[11px] text-amber-400/80">{item.note}</div>}
                    </div>
                    <button
                      type="button"
                      aria-label={`Add ${item.name}`}
                      onClick={() =>
                        setMessage(onAddItem(item) ? `Added ${item.name} to the bench` : 'No free reachable spot left: remove an item first')
                      }
                      className="flex shrink-0 cursor-pointer items-center gap-1 rounded bg-sky-600 px-2 py-1 font-medium text-white hover:bg-sky-500"
                    >
                      <Plus className="h-3 w-3" /> Add
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-xs">
          <span className="text-slate-400">{message ?? 'Remove items from the Workbench Objects list (trash icon).'}</span>
          <button
            type="button"
            onClick={() => {
              onRestoreDefaults();
              setMessage('Restored the default lab set');
            }}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded border border-white/10 px-2.5 py-1 text-slate-300 hover:bg-white/10"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Restore defaults
          </button>
        </div>
      </div>
    </div>
  );
};
