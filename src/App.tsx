/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  FileText, 
  Upload, 
  Download, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  FileDown,
  RefreshCw
} from 'lucide-react';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType } from 'docx';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for Tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Model configuration
const MODEL_NAME = "gemini-flash-latest"; 

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultMarkdown, setResultMarkdown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDownloaded, setIsDownloaded] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setError(null);
      setResultMarkdown(null);
      setIsDownloaded(false);
    } else {
      setError("Please upload a valid PDF file.");
    }
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const convertMarkdownToDocx = async (markdown: string) => {
    // Basic Markdown to docx parser
    // In a production app, we'd use a more robust library, but docx is powerful enough
    const lines = markdown.split('\n');
    const sections: any[] = [];
    
    let currentTable: any[][] = [];
    let inTable = false;

    lines.forEach((line) => {
      const trimmed = line.trim();
      
      // Table detection (very basic)
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        if (trimmed.includes('---')) return; // Skip separator
        inTable = true;
        const cells = trimmed.split('|').filter(c => c.trim() !== '').map(c => c.trim());
        currentTable.push(cells);
        return;
      } else if (inTable) {
        // End of table
        const table = new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: currentTable.map(row => new TableRow({
            children: row.map(cell => new TableCell({
              children: [new Paragraph({ children: [new TextRun(cell)] })],
            }))
          }))
        });
        sections.push(table);
        currentTable = [];
        inTable = false;
      }

      if (trimmed.startsWith('# ')) {
        sections.push(new Paragraph({ text: trimmed.replace('# ', ''), heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } }));
      } else if (trimmed.startsWith('## ')) {
        sections.push(new Paragraph({ text: trimmed.replace('## ', ''), heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 } }));
      } else if (trimmed.startsWith('### ')) {
        sections.push(new Paragraph({ text: trimmed.replace('### ', ''), heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } }));
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        sections.push(new Paragraph({ text: trimmed.substring(2), bullet: { level: 0 }, spacing: { after: 100 } }));
      } else if (trimmed.length > 0) {
        sections.push(new Paragraph({ children: [new TextRun(trimmed)], spacing: { after: 200 } }));
      }
    });

    const doc = new Document({
      sections: [{
        properties: {},
        children: sections,
      }],
    });

    const blob = await Packer.toBlob(doc);
    return blob;
  };

  const handleConvert = async () => {
    if (!file) return;

    setIsProcessing(true);
    setProgress(10);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const base64Data = await readFileAsBase64(file);
      setProgress(30);

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: [
          {
            parts: [
              {
                inlineData: {
                  data: base64Data,
                  mimeType: "application/pdf",
                },
              },
              {
                text: "Analyze the uploaded PDF meticulously. Extract all text, preserve the hierarchical structure (headings, body text), and identify tables. Reconstruct this content into a clean Markdown format. Do not add any conversational text, just the content of the document.",
              },
            ],
          },
        ],
      });

      const markdown = response.text;
      if (!markdown) throw new Error("AI failed to extract content.");
      
      setResultMarkdown(markdown);
      setProgress(90);
      
      setIsProcessing(false);
      setProgress(100);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred during conversion.");
      setIsProcessing(false);
    }
  };

  const downloadDocx = async () => {
    if (!resultMarkdown) return;
    
    try {
      const blob = await convertMarkdownToDocx(resultMarkdown);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${file?.name.replace('.pdf', '') || 'converted'}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setIsDownloaded(true);
    } catch (err) {
      console.error(err);
      setError("Failed to generate Word file.");
    }
  };

  const reset = () => {
    setFile(null);
    setResultMarkdown(null);
    setError(null);
    setProgress(0);
    setIsDownloaded(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-[#1a1a1a] font-sans p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="mb-12 text-center">
          <div className="inline-flex items-center justify-center p-3 mb-4 bg-white rounded-2xl shadow-sm">
            <FileText className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-2">AI PDF to Word</h1>
          <p className="text-gray-500 max-w-md mx-auto">
            Professional document conversion powered by Gemini 1.5 Flash.
            Preserves structure, headings, and tables.
          </p>
        </header>

        {/* Main Card */}
        <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden">
          {!resultMarkdown ? (
            <div className="p-8 md:p-12">
              <div 
                className={cn(
                  "relative border-2 border-dashed rounded-2xl p-12 text-center transition-all",
                  file ? "border-blue-200 bg-blue-50/30" : "border-gray-200 hover:border-blue-300"
                )}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const droppedFile = e.dataTransfer.files[0];
                  if (droppedFile?.type === 'application/pdf') {
                    setFile(droppedFile);
                    setError(null);
                  }
                }}
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".pdf"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center">
                    <Upload className="w-8 h-8 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-lg font-medium">
                      {file ? file.name : "Click or drag PDF here"}
                    </p>
                    <p className="text-sm text-gray-400">
                      {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "Maximum file size 20MB"}
                    </p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="mt-6 p-4 bg-red-50 text-red-600 rounded-xl flex items-center gap-3">
                  <AlertCircle className="w-5 h-5" />
                  <span className="text-sm font-medium">{error}</span>
                </div>
              )}

              <div className="mt-8 flex justify-center">
                <button
                  onClick={handleConvert}
                  disabled={!file || isProcessing}
                  className={cn(
                    "px-8 py-4 rounded-full font-semibold transition-all flex items-center gap-2 shadow-lg",
                    !file || isProcessing 
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed shadow-none" 
                      : "bg-blue-600 text-white hover:bg-blue-700 active:scale-95"
                  )}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-5 h-5" />
                      Convert to Word
                    </>
                  )}
                </button>
              </div>

              {isProcessing && (
                <div className="mt-8">
                  <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-600 transition-all duration-500 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-center text-xs text-gray-400 mt-2 font-medium uppercase tracking-wider">
                    AI is analyzing document structure... {progress}%
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col h-[600px]">
              {/* Success Header */}
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-bold">Conversion Ready</h3>
                    <p className="text-xs text-gray-400 uppercase tracking-tight">Previewing extracted content</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={reset}
                    className="p-2 hover:bg-gray-50 rounded-lg text-gray-400 transition-colors"
                  >
                    <RefreshCw className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Preview Area */}
              <div className="flex-1 overflow-y-auto p-8 bg-gray-50/50">
                <div className="max-w-2xl mx-auto bg-white p-12 shadow-sm rounded-xl border border-gray-100 prose prose-sm prose-blue">
                  <ReactMarkdown>{resultMarkdown}</ReactMarkdown>
                </div>
              </div>

              {/* Action Footer */}
              <div className="p-6 bg-white border-t border-gray-100 flex items-center justify-center gap-4">
                <button
                  onClick={downloadDocx}
                  className={cn(
                    "px-10 py-4 rounded-full font-bold flex items-center gap-3 shadow-xl transition-all active:scale-95",
                    isDownloaded 
                      ? "bg-green-600 text-white" 
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  )}
                >
                  {isDownloaded ? (
                    <>
                      <CheckCircle2 className="w-6 h-6" />
                      Downloaded!
                    </>
                  ) : (
                    <>
                      <FileDown className="w-6 h-6" />
                      Download .docx
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Info */}
        <footer className="mt-12 text-center text-gray-400 text-sm">
          <p>© 2026 AI Document Services. All processing happens in your browser.</p>
        </footer>
      </div>
    </div>
  );
}
