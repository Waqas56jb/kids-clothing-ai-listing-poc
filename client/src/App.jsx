import { Route, Routes } from 'react-router-dom'
import SellerLayout from './components/SellerLayout'
import ProtectedRoute from './auth/ProtectedRoute'
import LoginPage from './components/seller/LoginPage'

import DashboardPage from './components/seller/DashboardPage'
import UploadPage from './components/seller/UploadPage'
import ProcessingPage from './components/seller/ProcessingPage'
import ResultsPage from './components/seller/ResultsPage'
import GarmentDetailPage from './components/seller/GarmentDetailPage'
import MatchingReviewPage from './components/seller/MatchingReviewPage'
import GroupsPage from './components/seller/GroupsPage'
import ListingPreviewPage from './components/seller/ListingPreviewPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
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
      </Route>
    </Routes>
  )
}
