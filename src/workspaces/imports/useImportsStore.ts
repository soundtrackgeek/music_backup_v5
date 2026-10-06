import {
  type ImportProgress,
  type ImportPreview,
  type ImportRun,
  type CoverImportProgress,
  type CoverImportSummary,
  type BillboardImportSummary,
  type VgListaImportSummary,
  type OfficialUkImportSummary,
  type BillboardSinglesImportSummary,
  type TiISkuddetImportSummary,
  type NorsktoppenImportSummary,
} from "../../types";
import {
  createDefaultImportSourcePath,
  createDefaultCoverSourcePath,
  createDefaultBillboardSourcePath,
  createDefaultVgListaAlbumSourcePath,
  createDefaultOfficialUkAlbumSourcePath,
  createDefaultBillboardSinglesSourcePath,
  createDefaultVgListaSinglesSourcePath,
  createDefaultOfficialUkSinglesSourcePath,
  createDefaultTiISkuddetSourcePath,
  createDefaultNorsktoppenSourcePath,
} from "../../app/defaults";
import { defaultProgress, defaultCoverProgress } from "../../app/config";
import { useMemo } from "react";
import {
  createWorkspaceContext,
  createWorkspaceSetters,
  workspaceReducer,
} from "../../app/workspaceStore";
import { useReducer } from "react";
type ImportsState = {
  sourcePath: string;
  coverSourcePath: string;
  coverExtractEmbeddedFallback: boolean;
  coverReplaceExisting: boolean;
  progress: ImportProgress;
  importPreview: ImportPreview | null;
  latestAppliedImport: ImportRun | null;
  coverProgress: CoverImportProgress;
  isImporting: boolean;
  isApplyingImport: boolean;
  isCancellingImport: boolean;
  isImportingCovers: boolean;
  importError: string | null;
  coverImportError: string | null;
  coverImportSummary: CoverImportSummary | null;
  billboardSourcePath: string;
  isImportingBillboard: boolean;
  billboardImportError: string | null;
  billboardImportSummary: BillboardImportSummary | null;
  vgListaAlbumSourcePath: string;
  vgListaAlbumImportSummary: VgListaImportSummary | null;
  officialUkAlbumSourcePath: string;
  officialUkAlbumImportSummary: OfficialUkImportSummary | null;
  importAlbumChartsUs: boolean;
  importAlbumChartsNo: boolean;
  importAlbumChartsUk: boolean;
  billboardSinglesSourcePath: string;
  isImportingBillboardSingles: boolean;
  billboardSinglesImportError: string | null;
  billboardSinglesImportSummary: BillboardSinglesImportSummary | null;
  vgListaSinglesSourcePath: string;
  vgListaSinglesImportSummary: VgListaImportSummary | null;
  officialUkSinglesSourcePath: string;
  officialUkSinglesImportSummary: OfficialUkImportSummary | null;
  tiISkuddetSourcePath: string;
  tiISkuddetImportSummary: TiISkuddetImportSummary | null;
  norsktoppenSourcePath: string;
  norsktoppenImportSummary: NorsktoppenImportSummary | null;
  importSingleChartsUs: boolean;
  importSingleChartsNo: boolean;
  importSingleChartsUk: boolean;
  importSingleChartsTiISkuddet: boolean;
  importSingleChartsNorsktoppen: boolean;
};

function createInitialState(): ImportsState {
  const sourcePath: string = (() => createDefaultImportSourcePath())();
  const coverSourcePath: string = (() => createDefaultCoverSourcePath())();
  const coverExtractEmbeddedFallback: boolean = true;
  const coverReplaceExisting: boolean = false;
  const progress: ImportProgress = defaultProgress;
  const importPreview: ImportPreview | null = null;
  const latestAppliedImport: ImportRun | null = null;
  const coverProgress: CoverImportProgress = defaultCoverProgress;
  const isImporting: boolean = false;
  const isApplyingImport: boolean = false;
  const isCancellingImport: boolean = false;
  const isImportingCovers: boolean = false;
  const importError: string | null = null;
  const coverImportError: string | null = null;
  const coverImportSummary: CoverImportSummary | null = null;
  const billboardSourcePath: string = (() =>
    createDefaultBillboardSourcePath())();
  const isImportingBillboard: boolean = false;
  const billboardImportError: string | null = null;
  const billboardImportSummary: BillboardImportSummary | null = null;
  const vgListaAlbumSourcePath: string = (() =>
    createDefaultVgListaAlbumSourcePath())();
  const vgListaAlbumImportSummary: VgListaImportSummary | null = null;
  const officialUkAlbumSourcePath: string = (() =>
    createDefaultOfficialUkAlbumSourcePath())();
  const officialUkAlbumImportSummary: OfficialUkImportSummary | null = null;
  const importAlbumChartsUs: boolean = true;
  const importAlbumChartsNo: boolean = true;
  const importAlbumChartsUk: boolean = true;
  const billboardSinglesSourcePath: string = (() =>
    createDefaultBillboardSinglesSourcePath())();
  const isImportingBillboardSingles: boolean = false;
  const billboardSinglesImportError: string | null = null;
  const billboardSinglesImportSummary: BillboardSinglesImportSummary | null =
    null;
  const vgListaSinglesSourcePath: string = (() =>
    createDefaultVgListaSinglesSourcePath())();
  const vgListaSinglesImportSummary: VgListaImportSummary | null = null;
  const officialUkSinglesSourcePath: string = (() =>
    createDefaultOfficialUkSinglesSourcePath())();
  const officialUkSinglesImportSummary: OfficialUkImportSummary | null = null;
  const tiISkuddetSourcePath: string = (() =>
    createDefaultTiISkuddetSourcePath())();
  const tiISkuddetImportSummary: TiISkuddetImportSummary | null = null;
  const norsktoppenSourcePath: string = (() =>
    createDefaultNorsktoppenSourcePath())();
  const norsktoppenImportSummary: NorsktoppenImportSummary | null = null;
  const importSingleChartsUs: boolean = true;
  const importSingleChartsNo: boolean = true;
  const importSingleChartsUk: boolean = true;
  const importSingleChartsTiISkuddet: boolean = true;
  const importSingleChartsNorsktoppen: boolean = true;
  return {
    sourcePath,
    coverSourcePath,
    coverExtractEmbeddedFallback,
    coverReplaceExisting,
    progress,
    importPreview,
    latestAppliedImport,
    coverProgress,
    isImporting,
    isApplyingImport,
    isCancellingImport,
    isImportingCovers,
    importError,
    coverImportError,
    coverImportSummary,
    billboardSourcePath,
    isImportingBillboard,
    billboardImportError,
    billboardImportSummary,
    vgListaAlbumSourcePath,
    vgListaAlbumImportSummary,
    officialUkAlbumSourcePath,
    officialUkAlbumImportSummary,
    importAlbumChartsUs,
    importAlbumChartsNo,
    importAlbumChartsUk,
    billboardSinglesSourcePath,
    isImportingBillboardSingles,
    billboardSinglesImportError,
    billboardSinglesImportSummary,
    vgListaSinglesSourcePath,
    vgListaSinglesImportSummary,
    officialUkSinglesSourcePath,
    officialUkSinglesImportSummary,
    tiISkuddetSourcePath,
    tiISkuddetImportSummary,
    norsktoppenSourcePath,
    norsktoppenImportSummary,
    importSingleChartsUs,
    importSingleChartsNo,
    importSingleChartsUk,
    importSingleChartsTiISkuddet,
    importSingleChartsNorsktoppen,
  };
}

function useImportsStoreValue() {
  const [state, dispatch] = useReducer(
    workspaceReducer<ImportsState>,
    undefined,
    createInitialState,
  );
  const {
    sourcePath,
    coverSourcePath,
    coverExtractEmbeddedFallback,
    coverReplaceExisting,
    progress,
    importPreview,
    latestAppliedImport,
    coverProgress,
    isImporting,
    isApplyingImport,
    isCancellingImport,
    isImportingCovers,
    importError,
    coverImportError,
    coverImportSummary,
    billboardSourcePath,
    isImportingBillboard,
    billboardImportError,
    billboardImportSummary,
    vgListaAlbumSourcePath,
    vgListaAlbumImportSummary,
    officialUkAlbumSourcePath,
    officialUkAlbumImportSummary,
    importAlbumChartsUs,
    importAlbumChartsNo,
    importAlbumChartsUk,
    billboardSinglesSourcePath,
    isImportingBillboardSingles,
    billboardSinglesImportError,
    billboardSinglesImportSummary,
    vgListaSinglesSourcePath,
    vgListaSinglesImportSummary,
    officialUkSinglesSourcePath,
    officialUkSinglesImportSummary,
    tiISkuddetSourcePath,
    tiISkuddetImportSummary,
    norsktoppenSourcePath,
    norsktoppenImportSummary,
    importSingleChartsUs,
    importSingleChartsNo,
    importSingleChartsUk,
    importSingleChartsTiISkuddet,
    importSingleChartsNorsktoppen,
  } = state;
  const setters = useMemo(
    () =>
      createWorkspaceSetters<ImportsState>(dispatch, [
        "sourcePath",
        "coverSourcePath",
        "coverExtractEmbeddedFallback",
        "coverReplaceExisting",
        "progress",
        "importPreview",
        "latestAppliedImport",
        "coverProgress",
        "isImporting",
        "isApplyingImport",
        "isCancellingImport",
        "isImportingCovers",
        "importError",
        "coverImportError",
        "coverImportSummary",
        "billboardSourcePath",
        "isImportingBillboard",
        "billboardImportError",
        "billboardImportSummary",
        "vgListaAlbumSourcePath",
        "vgListaAlbumImportSummary",
        "officialUkAlbumSourcePath",
        "officialUkAlbumImportSummary",
        "importAlbumChartsUs",
        "importAlbumChartsNo",
        "importAlbumChartsUk",
        "billboardSinglesSourcePath",
        "isImportingBillboardSingles",
        "billboardSinglesImportError",
        "billboardSinglesImportSummary",
        "vgListaSinglesSourcePath",
        "vgListaSinglesImportSummary",
        "officialUkSinglesSourcePath",
        "officialUkSinglesImportSummary",
        "tiISkuddetSourcePath",
        "tiISkuddetImportSummary",
        "norsktoppenSourcePath",
        "norsktoppenImportSummary",
        "importSingleChartsUs",
        "importSingleChartsNo",
        "importSingleChartsUk",
        "importSingleChartsTiISkuddet",
        "importSingleChartsNorsktoppen",
      ]),
    [dispatch],
  );
  const {
    setSourcePath,
    setCoverSourcePath,
    setCoverExtractEmbeddedFallback,
    setCoverReplaceExisting,
    setProgress,
    setImportPreview,
    setLatestAppliedImport,
    setCoverProgress,
    setIsImporting,
    setIsApplyingImport,
    setIsCancellingImport,
    setIsImportingCovers,
    setImportError,
    setCoverImportError,
    setCoverImportSummary,
    setBillboardSourcePath,
    setIsImportingBillboard,
    setBillboardImportError,
    setBillboardImportSummary,
    setVgListaAlbumSourcePath,
    setVgListaAlbumImportSummary,
    setOfficialUkAlbumSourcePath,
    setOfficialUkAlbumImportSummary,
    setImportAlbumChartsUs,
    setImportAlbumChartsNo,
    setImportAlbumChartsUk,
    setBillboardSinglesSourcePath,
    setIsImportingBillboardSingles,
    setBillboardSinglesImportError,
    setBillboardSinglesImportSummary,
    setVgListaSinglesSourcePath,
    setVgListaSinglesImportSummary,
    setOfficialUkSinglesSourcePath,
    setOfficialUkSinglesImportSummary,
    setTiISkuddetSourcePath,
    setTiISkuddetImportSummary,
    setNorsktoppenSourcePath,
    setNorsktoppenImportSummary,
    setImportSingleChartsUs,
    setImportSingleChartsNo,
    setImportSingleChartsUk,
    setImportSingleChartsTiISkuddet,
    setImportSingleChartsNorsktoppen,
  } = setters;

  return {
    sourcePath,
    setSourcePath,
    coverSourcePath,
    setCoverSourcePath,
    coverExtractEmbeddedFallback,
    setCoverExtractEmbeddedFallback,
    coverReplaceExisting,
    setCoverReplaceExisting,
    progress,
    setProgress,
    importPreview,
    setImportPreview,
    latestAppliedImport,
    setLatestAppliedImport,
    coverProgress,
    setCoverProgress,
    isImporting,
    setIsImporting,
    isApplyingImport,
    setIsApplyingImport,
    isCancellingImport,
    setIsCancellingImport,
    isImportingCovers,
    setIsImportingCovers,
    importError,
    setImportError,
    coverImportError,
    setCoverImportError,
    coverImportSummary,
    setCoverImportSummary,
    billboardSourcePath,
    setBillboardSourcePath,
    isImportingBillboard,
    setIsImportingBillboard,
    billboardImportError,
    setBillboardImportError,
    billboardImportSummary,
    setBillboardImportSummary,
    vgListaAlbumSourcePath,
    setVgListaAlbumSourcePath,
    vgListaAlbumImportSummary,
    setVgListaAlbumImportSummary,
    officialUkAlbumSourcePath,
    setOfficialUkAlbumSourcePath,
    officialUkAlbumImportSummary,
    setOfficialUkAlbumImportSummary,
    importAlbumChartsUs,
    setImportAlbumChartsUs,
    importAlbumChartsNo,
    setImportAlbumChartsNo,
    importAlbumChartsUk,
    setImportAlbumChartsUk,
    billboardSinglesSourcePath,
    setBillboardSinglesSourcePath,
    isImportingBillboardSingles,
    setIsImportingBillboardSingles,
    billboardSinglesImportError,
    setBillboardSinglesImportError,
    billboardSinglesImportSummary,
    setBillboardSinglesImportSummary,
    vgListaSinglesSourcePath,
    setVgListaSinglesSourcePath,
    vgListaSinglesImportSummary,
    setVgListaSinglesImportSummary,
    officialUkSinglesSourcePath,
    setOfficialUkSinglesSourcePath,
    officialUkSinglesImportSummary,
    setOfficialUkSinglesImportSummary,
    tiISkuddetSourcePath,
    setTiISkuddetSourcePath,
    tiISkuddetImportSummary,
    setTiISkuddetImportSummary,
    norsktoppenSourcePath,
    setNorsktoppenSourcePath,
    norsktoppenImportSummary,
    setNorsktoppenImportSummary,
    importSingleChartsUs,
    setImportSingleChartsUs,
    importSingleChartsNo,
    setImportSingleChartsNo,
    importSingleChartsUk,
    setImportSingleChartsUk,
    importSingleChartsTiISkuddet,
    setImportSingleChartsTiISkuddet,
    importSingleChartsNorsktoppen,
    setImportSingleChartsNorsktoppen,
  };
}

export const { Provider: ImportsStoreProvider, useStore: useImportsStore } =
  createWorkspaceContext(useImportsStoreValue, "imports");
