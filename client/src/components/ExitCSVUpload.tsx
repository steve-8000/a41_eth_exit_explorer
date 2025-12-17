import React, { useState } from 'react';
import './ExitCSVUpload.css';

interface ExitCSVUploadProps {
  onUpload: () => void;
}

const ExitCSVUpload: React.FC<ExitCSVUploadProps> = ({ onUpload }) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setMessage(null);
    }
  };

  const handleFileButtonClick = () => {
    const fileInput = document.getElementById('exit-csv-file-input') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setMessage({ type: 'error', text: 'Please select a CSV file' });
      return;
    }

    const formData = new FormData();
    formData.append('csv', file);

    try {
      setUploading(true);
      setMessage(null);

      const response = await fetch('/api/upload-exit-csv', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setMessage({
        type: 'success',
        text: `Successfully processed ${data.total} validators (Batch ID: ${data.batchId})`
      });

      setFile(null);
      // Reset file input
      const fileInput = document.getElementById('exit-csv-file-input') as HTMLInputElement;
      if (fileInput) {
        fileInput.value = '';
      }

      onUpload();
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Upload failed'
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="exit-csv-upload-container">
      <div className="exit-csv-upload-form">
        <input
          id="exit-csv-file-input"
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          disabled={uploading}
          className="file-input-hidden"
        />
        <button
          type="button"
          onClick={handleFileButtonClick}
          disabled={uploading}
          className="file-select-button"
        >
          {file ? file.name : 'Select File'}
        </button>
        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="upload-button"
        >
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
        {message && (
          <div className={`upload-message-inline ${message.type}`}>
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
};

export default ExitCSVUpload;

