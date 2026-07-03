import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import MainLayout from "./components/MainLayout";
import DocumentList from "./components/DocumentList";
import DocumentCreate from "./components/DocumentCreate";
import DocumentView from "./components/DocumentView";
import BatchSignPage from "./components/BatchSignPage";
import AdminDocumentsPage from "./components/AdminDocumentsPage";
import AdminUsersPage from "./components/AdminUsersPage";
import AdminDocumentTypesPage from "./components/AdminDocumentTypesPage";
import AdminAuditLogsPage from "./components/AdminAuditLogsPage";
import AdminSignatureMonitoringPage from "./components/AdminSignatureMonitoringPage";
import AdminPlatformSettingsPage from "./components/AdminPlatformSettingsPage";
import AdminNotificationsPage from "./components/AdminNotificationsPage";
import AdminReportsPage from "./components/AdminReportsPage";
import AdminArchivePage from "./components/AdminArchivePage";
import AdminSecurityPage from "./components/AdminSecurityPage";
import { ToastProvider } from "./components/Toast";
import "./App.css";

function App() {
    return (
        <ToastProvider>
            <BrowserRouter>
                <ProtectedRoute>
                    <Routes>
                        <Route path='/' element={<MainLayout />}>
                            <Route
                                index
                                element={<Navigate to='/documents' replace />}
                            />
                            <Route
                                path='documents'
                                element={<DocumentList type='my' />}
                            />
                            <Route
                                path='documents/pending'
                                element={<DocumentList type='pending' />}
                            />
                            <Route
                                path='documents/new'
                                element={<DocumentCreate />}
                            />
                            <Route
                                path='documents/:id'
                                element={<DocumentView />}
                            />
                            <Route
                                path='documents/batch-sign'
                                element={<BatchSignPage />}
                            />
                            <Route
                                path='admin/documents'
                                element={<AdminDocumentsPage />}
                            />
                            <Route
                                path='admin/users'
                                element={<AdminUsersPage />}
                            />
                            <Route
                                path='admin/document-types'
                                element={<AdminDocumentTypesPage />}
                            />
                            <Route
                                path='admin/audit-logs'
                                element={<AdminAuditLogsPage />}
                            />
                            <Route
                                path='admin/signature-monitoring'
                                element={<AdminSignatureMonitoringPage />}
                            />
                            <Route
                                path='admin/platform-settings'
                                element={<AdminPlatformSettingsPage />}
                            />
                            <Route
                                path='admin/notifications'
                                element={<AdminNotificationsPage />}
                            />
                            <Route
                                path='admin/reports'
                                element={<AdminReportsPage />}
                            />
                            <Route
                                path='admin/archive'
                                element={<AdminArchivePage />}
                            />
                            <Route
                                path='admin/security'
                                element={<AdminSecurityPage />}
                            />
                        </Route>
                    </Routes>
                </ProtectedRoute>
            </BrowserRouter>
        </ToastProvider>
    );
}
// hello owrd?
export default App;
