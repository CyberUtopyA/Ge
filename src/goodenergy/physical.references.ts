import {
  PhysicalProject,
  PhysicalReferenceAsset,
  physicalId,
} from './physical.model';

export type ReferenceImport = Pick<
  PhysicalReferenceAsset,
  'uri' | 'format' | 'source'
> & {title?: string; roomId?: string};
export type ReferenceImportAdapter = {
  id: string;
  formats: string[];
  pick?: () => Promise<ReferenceImport | null>;
  resolve?: (uri: string) => Promise<ReferenceImport | null>;
};
let importAdapters: ReferenceImportAdapter[] = [];
export function setReferenceImportAdapters(adapters: ReferenceImportAdapter[]) {
  importAdapters = [...adapters];
}
export function getReferenceImportAdapters() {
  return importAdapters;
}

export function attachReference(
  project: PhysicalProject,
  input: ReferenceImport,
): PhysicalProject {
  const uri = input.uri.trim();
  if (!uri || !input.format.trim() || !input.source.trim()) return project;
  const asset: PhysicalReferenceAsset = {
    id: physicalId('reference'),
    uri,
    format: input.format,
    source: input.source,
    importedAt: Date.now(),
    title: input.title?.trim() || uri.split(/[\\/]/).pop() || 'Referencia',
    roomId: input.roomId,
  };
  return {...project, references: [...(project.references || []), asset]};
}
