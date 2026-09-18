import { Navigate, Route, Routes } from 'react-router-dom'
import SellerLayout from './components/SellerLayout'
import ProtectedRoute, { AuthSplash } from './auth/ProtectedRoute'
import LoginPage from './components/seller/LoginPage'
import LandingPage from './components/marketing/LandingPage'
import PublicLayout from './components/marketplace/PublicLayout'
import MarketplacePage from './components/marketplace/MarketplacePage'
import ListingDetailPage from './components/marketplace/ListingDetailPage'
import CartPage from './components/shop/CartPage'
import CheckoutPage from './components/shop/CheckoutPage'
import PaymentPage from './components/shop/PaymentPage'
import OrderConfirmationPage from './components/shop/OrderConfirmationPage'
import NotificationsPage from './components/shop/NotificationsPage'
import MessagesPage from './components/shop/MessagesPage'
import { useAuth } from './auth/AuthContext'

import DashboardPage from './components/seller/DashboardPage'
import UploadPage from './components/seller/UploadPage'
import ProcessingPage from './components/seller/ProcessingPage'
import ResultsPage from './components/seller/ResultsPage'
import GarmentDetailPage from './components/seller/GarmentDetailPage'
import MatchingReviewPage from './components/seller/MatchingReviewPage'
import GroupsPage from './components/seller/GroupsPage'
import ListingPreviewPage from './components/seller/ListingPreviewPage'
import MyListingsPage from './components/seller/MyListingsPage'

function HomeGate() {
  const { loading, session } = useAuth()
  if (loading) return <AuthSplash />
  if (session) return <Navigate to="/dashboard" replace />
  return <LandingPage />
}

// Marketplace pages stay public, but a signed-in user keeps the seller panel
// (left sidebar) around them so navigation never feels stuck.
function MarketLayout() {
  const { loading, session } = useAuth()
  if (loading) return <AuthSplash />
  return session ? <SellerLayout /> : <PublicLayout />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeGate />} />
      <Route path="/login" element={<LoginPage />} />

      {/* Public marketplace: browse, search, filter and open listings without an account. */}
      <Route element={<MarketLayout />}>
        <Route path="/marknad" element={<MarketplacePage />} />
        <Route path="/marknad/:listingId" element={<ListingDetailPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<SellerLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/processing/:jobId" element={<ProcessingPage />} />
          <Route path="/results/:jobId" element={<ResultsPage />} />
          <Route path="/garments/:jobId/:detectionId" element={<GarmentDetailPage />} />
          <Route path="/matching/:jobId" element={<MatchingReviewPage />} />
          <Route path="/groups/:jobId" element={<GroupsPage />} />
          <Route path="/listings/:jobId" element={<ListingPreviewPage />} />
          <Route path="/annonser" element={<MyListingsPage />} />
          {/* Shopping, notifications and messages live inside the seller panel too. */}
          <Route path="/varukorg" element={<CartPage />} />
          <Route path="/kassa" element={<CheckoutPage />} />
          <Route path="/kassa/betala/:orderId" element={<PaymentPage />} />
          <Route path="/kassa/klart/:orderId" element={<OrderConfirmationPage />} />
          <Route path="/notiser" element={<NotificationsPage />} />
          <Route path="/meddelanden" element={<MessagesPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
