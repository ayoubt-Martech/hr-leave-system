import {
    AlertCircle,
    CheckCircle2,
    Download,
    FileSpreadsheet,
    Upload
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { ApiService } from '../services/api';
import { MigrationImportSummary, MigrationSheetReview, User } from '../types';
import {
    generatePlaceholderEmail,
    parseLegacyWorkbook,
    suggestKnownEmail,
    suggestUserMatch
} from '../utils/excelMigration';
import { MigrationReviewTable } from './MigrationReviewTable';

interface ExcelMigrationModalProps {
  onMigrationComplete: () => void;
}

export const ExcelMigrationModal: React.FC<ExcelMigrationModalProps> = ({ onMigrationComplete }) => {
  const [existingUsers, setExistingUsers] = useState<User[]>([]);
  const [reviews, setReviews] = useState<MigrationSheetReview[] | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<MigrationImportSummary | null>(null);

  useEffect(() => {
    ApiService.getUsers().then(setExistingUsers).catch(() => {});
  }, []);

  const handleExport = async () => {
    setIsExporting(true);
    setFileError(null);
    try {
      await ApiService.exportData();
    } catch (err: any) {
      setFileError(err.message ?? 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setFileError('Please select a valid Microsoft Excel (.xlsx or .xls) file.');
      return;
    }

    setIsParsing(true);
    setFileError(null);
    setImportSummary(null);

    try {
      const parsedSheets = await parseLegacyWorkbook(file);

      const initialReviews: MigrationSheetReview[] = parsedSheets.map((sheet) => {
        const knownEmail = suggestKnownEmail(sheet);
        const match = suggestUserMatch(sheet, existingUsers, knownEmail);

        let action: MigrationSheetReview['action'];
        if (sheet.isEmpty) action = 'skip';
        else if (match.confidence !== 'none') action = 'map';
        else action = 'create';

        return {
          sheetName: sheet.sheetName,
          employeeName: sheet.employeeName,
          isEmpty: sheet.isEmpty,
          action,
          mappedUserId: match.matchedUserId,
          matchConfidence: match.confidence,
          isTerminated: sheet.isTerminated,
          terminationDate: sheet.terminationDate,
          openingBalance: sheet.openingBalance ?? 0,
          balanceSource: sheet.balanceSource,
          newUserEmail: knownEmail ?? generatePlaceholderEmail(sheet.employeeName),
          newUserPosition: 'Team Member',
          leaveRows: sheet.leaveRows.map((lr) => ({
            start_date: lr.startDate,
            end_date: lr.dueDate,
            return_date: lr.recoveryDate,
            days_count: lr.days,
            type: lr.type,
            note: lr.note,
          })),
        };
      });

      setReviews(initialReviews);
    } catch (err: any) {
      setFileError('Failed to parse Excel file: ' + (err.message ?? 'Check spreadsheet formatting'));
    } finally {
      setIsParsing(false);
    }
  };

  const handleReviewChange = (index: number, patch: Partial<MigrationSheetReview>) => {
    setReviews((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const handleConfirmImport = async () => {
    if (!reviews) return;

    const invalidCreate = reviews.find((r) => r.action === 'create' && !r.newUserEmail.trim());
    if (invalidCreate) {
      setFileError(`"${invalidCreate.employeeName}" is set to create a new user but has no email.`);
      return;
    }
    const invalidMap = reviews.find((r) => r.action === 'map' && !r.mappedUserId);
    if (invalidMap) {
      setFileError(`"${invalidMap.employeeName}" is set to map to an existing user but none is selected.`);
      return;
    }

    setIsImporting(true);
    setFileError(null);

    try {
      const result = await ApiService.importLegacyData(reviews);
      setImportSummary(result.summary);
      setReviews(null);
      ApiService.getUsers().then(setExistingUsers).catch(() => {});
      onMigrationComplete();
    } catch (err: any) {
      setFileError('Import failed: ' + (err.message ?? 'Unknown error'));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6">

      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">Excel Data Migration</h1>
            <span className="text-[11px] px-2.5 py-0.5 bg-purple-50 text-purple-700 font-semibold rounded-md border border-purple-200/80">
              SuperAdmin
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            Import the old Absence Leave.xlsx tracker once, or export current data anytime for backup.
          </p>
        </div>

        <button
          onClick={handleExport}
          disabled={isExporting}
          className="px-3.5 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 disabled:opacity-50 text-zinc-800 text-xs font-semibold flex items-center gap-2 transition-colors shrink-0 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-zinc-600" />
          <span>{isExporting ? 'Preparing export…' : 'Export Current Data (.xlsx)'}</span>
        </button>
      </div>

      {/* Error message */}
      {fileError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{fileError}</span>
        </div>
      )}

      {/* Import Success Summary */}
      {importSummary && (
        <div className="p-5 bg-zinc-900 text-white rounded-2xl space-y-2">
          <div className="flex items-center gap-2 font-semibold text-sm text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            <span>Import Complete</span>
          </div>
          <p className="text-xs text-zinc-300">
            {importSummary.created} user{importSummary.created === 1 ? '' : 's'} created ·{' '}
            {importSummary.mapped} mapped to existing account{importSummary.mapped === 1 ? '' : 's'} ·{' '}
            {importSummary.skipped} sheet{importSummary.skipped === 1 ? '' : 's'} skipped ·{' '}
            {importSummary.leaveRowsInserted} historical leave record{importSummary.leaveRowsInserted === 1 ? '' : 's'} imported.
          </p>
        </div>
      )}

      {/* Upload zone (shown before a file has been parsed) */}
      {!reviews && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const files = e.dataTransfer.files;
            if (files && files[0]) handleFileUpload(files[0]);
          }}
          className={`p-10 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center transition-colors ${
            dragOver ? 'border-zinc-900 bg-zinc-100/50' : 'border-zinc-200 hover:border-zinc-300 bg-white'
          }`}
        >
          <Upload className="w-8 h-8 text-zinc-400 mb-3" />
          <div className="text-sm font-semibold text-zinc-800">Upload Absence Leave.xlsx</div>
          <p className="text-xs text-zinc-500 mt-1 max-w-sm">
            Each tab gets parsed, and you'll review how it maps to an account before anything
            is saved.
          </p>

          <label className="mt-4 cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 rounded-xl text-xs font-semibold text-white transition-colors shadow-xs">
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>{isParsing ? 'Parsing…' : 'Select File'}</span>
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              disabled={isParsing}
              onChange={(e) => {
                const files = e.target.files;
                if (files && files[0]) handleFileUpload(files[0]);
              }}
            />
          </label>
        </div>
      )}

      {/* Review step */}
      {reviews && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-600">
              Review each sheet below, then confirm. Nothing is written to the database until you click{' '}
              <strong>Confirm Import</strong>.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setReviews(null); setFileError(null); }}
                className="px-3.5 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={isImporting}
                className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white text-xs font-semibold shadow-xs cursor-pointer"
              >
                {isImporting ? 'Importing…' : 'Confirm Import'}
              </button>
            </div>
          </div>

          <MigrationReviewTable reviews={reviews} existingUsers={existingUsers} onChange={handleReviewChange} />
        </div>
      )}

    </div>
  );
};
