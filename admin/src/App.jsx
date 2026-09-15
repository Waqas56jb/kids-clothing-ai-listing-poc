import { Route, Routes } from 'react-router-dom'
import AdminLayout from './components/AdminLayout'

import DashboardPage from './components/pages/DashboardPage'
import ProjectsPage from './components/pages/ProjectsPage'
import ProjectDetailPage from './components/pages/ProjectDetailPage'
import GarmentManagementPage from './components/pages/GarmentManagementPage'
import DetectionReviewPage from './components/pages/DetectionReviewPage'
import MatchingReviewPage from './components/pages/MatchingReviewPage'
import GroupsPickerPage from './components/pages/GroupsPickerPage'
import GroupsPage from './components/pages/GroupsPage'
import JobsMonitorPage from './components/pages/JobsMonitorPage'
import ReviewQueuePage from './components/pages/ReviewQueuePage'
import ListingsPickerPage from './components/pages/ListingsPickerPage'
import ListingPreviewPage from './components/pages/ListingPreviewPage'
import PricingEnginePage from './components/pages/PricingEnginePage'
import PricingDetailPage from './components/pages/PricingDetailPage'

export default function App() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:jobId" element={<ProjectDetailPage />} />
        <Route path="/garments/:jobId" element={<GarmentManagementPage />} />
        <Route path="/garments/:jobId/:detectionId" element={<DetectionReviewPage />} />
        <Route path="/matching/:jobId" element={<MatchingReviewPage />} />
        <Route path="/groups" element={<GroupsPickerPage />} />
        <Route path="/groups/:jobId" element={<GroupsPage />} />
        <Route path="/jobs" element={<JobsMonitorPage />} />
        <Route path="/review-queue" element={<ReviewQueuePage />} />
        <Route path="/listings" element={<ListingsPickerPage />} />
        <Route path="/listings/:jobId" element={<ListingPreviewPage />} />
        <Route path="/pricing" element={<PricingEnginePage />} />
        <Route path="/pricing/garment/:jobId/:detectionId" element={<PricingDetailPage kind="garment" />} />
        <Route path="/pricing/group/:jobId/:groupId" element={<PricingDetailPage kind="group" />} />
      </Route>
    </Routes>
  )
}
