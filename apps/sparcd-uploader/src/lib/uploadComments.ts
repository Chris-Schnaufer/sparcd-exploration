export type RequiredUploadComments = {
  mountainRange: string;
  dateCollected: string;
};

export function formatUploadComments(input: {
  required?: RequiredUploadComments;
  siteName: string;
  imageCount: number;
  uploadDate: Date;
  comments: string;
}): string {
  if (!input.required) return input.comments;
  const date = input.uploadDate;
  const uploaded = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const prefix = `${input.required.mountainRange.trim()} - ${input.siteName} - ${input.imageCount} images - uploaded ${uploaded} - collected ${input.required.dateCollected}`;
  return input.comments.trim() ? `${prefix} - ${input.comments}` : prefix;
}
