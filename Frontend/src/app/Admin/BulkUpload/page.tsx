"use client";

import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { toast } from "react-toastify";
import { baseUrl } from "../../utils/commonFunctions";

export default function BulkUploadPage() {
  const [dataFile, setDataFile] = useState<File | null>(null);
  const [imagesZip, setImagesZip] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [currentJob, setCurrentJob] = useState<any>(null);
  const [recentJobs, setRecentJobs] = useState<any[]>([]);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchRecentJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // BUG-8: clear the job-status poll interval when the page unmounts so it
  // doesn't keep firing API calls after the admin navigates away.
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  // BUG-11: refresh Recent Uploads every 10s while any job is still
  // processing, so the table updates without a manual page reload.
  useEffect(() => {
    const hasProcessing = recentJobs.some((j) => j.status === "processing");
    if (!hasProcessing) return;
    const interval = setInterval(fetchRecentJobs, 10000);
    return () => clearInterval(interval);
  }, [recentJobs]);

  const fetchRecentJobs = async () => {
    try {
      const { data } = await axios.get(`${baseUrl}bulk-product/jobs`, {
        withCredentials: true,
      });
      setRecentJobs(data.data || []);
    } catch (err) {
      console.error("Failed to fetch jobs", err);
    }
  };

  const downloadTemplate = async () => {
    try {
      const response = await axios.get(`${baseUrl}bulk-product/template`, {
        withCredentials: true,
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "bulk-product-template.xlsx");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Failed to download template");
    }
  };

  const handleUpload = async () => {
    if (!dataFile) {
      toast.error("Please select a product data file (CSV/Excel)");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("dataFile", dataFile);
      if (imagesZip) formData.append("imagesZip", imagesZip);

      const { data } = await axios.post(
        `${baseUrl}bulk-product/upload`,
        formData,
        { withCredentials: true }
      );

      toast.success(data.message);
      pollJobStatus(data.jobId);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Upload failed");
      setUploading(false);
    }
  };

  const pollJobStatus = (jobId: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(async () => {
      try {
        const { data } = await axios.get(
          `${baseUrl}bulk-product/jobs/${jobId}`,
          { withCredentials: true }
        );
        setCurrentJob(data.data);

        if (data.data.status !== "processing") {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setUploading(false);
          fetchRecentJobs();

          if (data.data.status === "completed") {
            const parts = [];
            if (data.data.successCount) parts.push(`${data.data.successCount} created`);
            if (data.data.updatedCount) parts.push(`${data.data.updatedCount} updated`);
            toast.success(parts.length ? parts.join(', ') : 'Done!');
          } else if (data.data.status === "completed_with_errors") {
            const parts = [];
            if (data.data.successCount) parts.push(`${data.data.successCount} created`);
            if (data.data.updatedCount) parts.push(`${data.data.updatedCount} updated`);
            if (data.data.failedCount) parts.push(`${data.data.failedCount} failed`);
            toast.warning(parts.join(', '));
          } else {
            toast.error("Upload failed");
          }
        }
      } catch (err) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        setUploading(false);
      }
    }, 2000);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-[#222831] mb-6">
        Bulk Product Upload
      </h1>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold text-lg mb-4">Step 1: Download Template</h2>
        <p className="text-gray-600 mb-4 text-sm">
          Download the Excel template, fill in your product details, then
          upload it below. The template includes optional
          <strong> variantPrice_*</strong> and <strong>variantStock_*</strong> columns
          for size-based pricing, and an <strong>imageUrls</strong> column
          for direct image links (no ZIP needed). Products with the same
          name + category will be updated instead of duplicated.
        </p>
        <button
          onClick={downloadTemplate}
          className="bg-[#C8A84E] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#222831] transition-colors"
        >
          Download Template (.xlsx)
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold text-lg mb-4">Step 2: Upload Files</h2>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">
            Product Data File (.csv or .xlsx) *
          </label>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => setDataFile(e.target.files?.[0] || null)}
            className="border border-gray-300 rounded-xl px-4 py-3 w-full"
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">
            Product Images (.zip) — <span className="text-gray-500 font-normal">Optional if your data file uses the <code>imageUrls</code> column for direct image links.</span>
          </label>
          <input
            type="file"
            accept=".zip"
            onChange={(e) => setImagesZip(e.target.files?.[0] || null)}
            className="border border-gray-300 rounded-xl px-4 py-3 w-full"
          />
        </div>

        <button
          onClick={handleUpload}
          disabled={uploading || !dataFile}
          className="bg-[#222831] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#C8A84E] transition-colors disabled:opacity-50"
        >
          {uploading ? "Processing..." : "Upload & Create Products"}
        </button>
      </div>

      {currentJob && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold text-lg mb-4">Current Job Progress</h2>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-[#222831]">
                {currentJob.totalRows}
              </p>
              <p className="text-sm text-gray-500">Total Rows</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">
                {currentJob.successCount}
              </p>
              <p className="text-sm text-gray-500">Created</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">
                {currentJob.updatedCount || 0}
              </p>
              <p className="text-sm text-gray-500">Updated</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600">
                {currentJob.failedCount}
              </p>
              <p className="text-sm text-gray-500">Failed</p>
            </div>
          </div>
          <p className="text-sm font-medium mb-2">
            Status: <span className="capitalize">{currentJob.status}</span>
          </p>

          {currentJob.errors && currentJob.errors.length > 0 && (
            <div className="mt-4">
              <p className="font-medium text-sm mb-2">Errors:</p>
              <div className="max-h-60 overflow-y-auto border border-red-200 rounded-xl p-3 bg-red-50">
                {currentJob.errors.map((err: any, i: number) => (
                  <div key={i} className="text-sm text-red-700 mb-1">
                    Row {err.row} ({err.productName}): {err.reason}
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentJob.warnings && currentJob.warnings.length > 0 && (
            <div className="mt-4">
              <p className="font-medium text-sm mb-2">
                Image warnings (product still processed):
              </p>
              <div className="max-h-60 overflow-y-auto border border-amber-200 rounded-xl p-3 bg-amber-50">
                {currentJob.warnings.map((w: any, i: number) => (
                  <div key={i} className="text-sm text-amber-700 mb-1">
                    Row {w.row} ({w.productName}): {w.reason}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {recentJobs.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="font-semibold text-lg mb-4">Recent Uploads</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2">Date</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Created</th>
                <th className="pb-2">Updated</th>
                <th className="pb-2">Failed</th>
              </tr>
            </thead>
            <tbody>
              {recentJobs.map((job) => (
                <tr key={job._id} className="border-b border-gray-100">
                  <td className="py-2">
                    {new Date(job.createdAt).toLocaleString()}
                  </td>
                  <td className="py-2 capitalize">{job.status}</td>
                  <td className="py-2 text-green-600">{job.successCount}</td>
                  <td className="py-2 text-blue-600">{job.updatedCount || 0}</td>
                  <td className="py-2 text-red-600">{job.failedCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
