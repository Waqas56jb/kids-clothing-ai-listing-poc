import { Route, Routes } from 'react-router-dom'
import SellerLayout from './components/SellerLayout'
import AdminLayout from './components/AdminLayout'

import DashboardPage from './components/seller/DashboardPage'
import UploadPage from './components/seller/UploadPage'
import ProcessingPage from './components/seller/ProcessingPage'
import ResultsPage from './components/seller/ResultsPage'
import GarmentDetailPage from './components/seller/GarmentDetailPage'
import MatchingReviewPage from './components/seller/MatchingReviewPage'
import GroupsPage from './components/seller/GroupsPage'
import ListingPreviewPage from './components/seller/ListingPreviewPage'

import AdminDashboardPage from './components/admin/AdminDashboardPage'
import ProjectsPage from './components/admin/ProjectsPage'
import ProjectDetailPage from './components/admin/ProjectDetailPage'
import GarmentManagementPage from './components/admin/GarmentManagementPage'
import DetectionReviewPage from './components/admin/DetectionReviewPage'
import JobsMonitorPage from './components/admin/JobsMonitorPage'
import ReviewQueuePage from './components/admin/ReviewQueuePage'
import AdminGroupsPage from './components/admin/AdminGroupsPage'
import AdminListingsPage from './components/admin/AdminListingsPage'

export default function App() {
  return (
    <Routes>
      <Route element={<SellerLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/processing/:jobId" element={<ProcessingPage />} />
        <Route path="/results/:jobId" element={<ResultsPage />} />
        <Route path="/garments/:jobId/:detectionId" element={<GarmentDetailPage />} />
        <Route path="/matching/:jobId" element={<MatchingReviewPage />} />
        <Route path="/groups/:jobId" element={<GroupsPage />} />
        <Route path="/listings/:jobId" element={<ListingPreviewPage />} />
      </Route>

      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboardPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:jobId" element={<ProjectDetailPage />} />
        <Route path="garments/:jobId" element={<GarmentManagementPage />} />
        <Route path="garments/:jobId/:detectionId" element={<DetectionReviewPage />} />
        <Route path="matching/:jobId" element={<MatchingReviewPage />} />
        <Route path="groups" element={<AdminGroupsPage />} />
        <Route path="groups/:jobId" element={<GroupsPage />} />
        <Route path="jobs" element={<JobsMonitorPage />} />
        <Route path="review-queue" element={<ReviewQueuePage />} />
        <Route path="listings" element={<AdminListingsPage />} />
        <Route path="listings/:jobId" element={<ListingPreviewPage />} />
      </Route>
    </Routes>
  )
}
