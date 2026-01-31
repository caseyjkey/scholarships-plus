/**
 * Text extraction from various file formats
 * Supports PDF, DOC, DOCX, and TXT files
 */

import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface ExtractedText {
  text: string;
  metadata?: {
    pages?: number;
    title?: string;
    author?: string;
    [key: string]: any;
  };
}

/**
 * Extract text from a file buffer
 * Detects file type based on extension or magic bytes
 */
export async function extractTextFromFile(
  buffer: Buffer,
  filename: string
): Promise<ExtractedText> {
  const extension = filename.toLowerCase().split('.').pop();

  switch (extension) {
    case 'pdf':
      return await extractFromPDF(buffer);
    case 'docx':
    case 'doc':
      return await extractFromDOCX(buffer);
    case 'txt':
      return { text: buffer.toString('utf-8') };
    default:
      throw new Error(`Unsupported file type: ${extension}`);
  }
}

/**
 * Extract text from PDF file
 */
async function extractFromPDF(buffer: Buffer): Promise<ExtractedText> {
  try {
    const data = await pdf(buffer);

    return {
      text: data.text,
      metadata: {
        pages: data.numpages,
        title: data.info?.Title,
        author: data.info?.Author,
      },
    };
  } catch (error) {
    throw new Error(`PDF extraction failed: ${error}`);
  }
}

/**
 * Extract text from DOCX file
 * Note: Legacy .doc files are not supported, only .docx
 */
async function extractFromDOCX(buffer: Buffer): Promise<ExtractedText> {
  try {
    const result = await mammoth.extractRawText({ buffer });

    return {
      text: result.value,
      metadata: {
        warnings: result.messages,
      },
    };
  } catch (error) {
    throw new Error(`DOCX extraction failed: ${error}`);
  }
}

/**
 * Extract text from a file path
 * Useful for processing files already on disk
 */
export async function extractTextFromFilePath(
  filePath: string
): Promise<ExtractedText> {
  const buffer = readFileSync(filePath);
  const filename = filePath.split('/').pop() || 'unknown';
  return extractTextFromFile(buffer, filename);
}

/**
 * Clean and normalize extracted text
 * Removes excess whitespace, normalizes line breaks
 */
export function cleanExtractedText(text: string): string {
  return (
    text
      // Normalize line breaks
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Remove multiple consecutive spaces
      .replace(/[ \t]+/g, ' ')
      // Remove multiple consecutive blank lines
      .replace(/\n{3,}/g, '\n\n')
      // Trim leading/trailing whitespace
      .trim()
  );
}

/**
 * Chunk long text into smaller pieces for embedding
 * Useful for documents that exceed embedding token limits
 */
export function chunkText(
  text: string,
  maxChunkSize: number = 1000,
  overlap: number = 100
): string[] {
  const chunks: string[] = [];
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

  let currentChunk = '';

  for (const sentence of sentences) {
    const testChunk = currentChunk + ' ' + sentence;

    if (testChunk.length <= maxChunkSize) {
      currentChunk = testChunk.trim();
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      currentChunk = sentence.trim();
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}
