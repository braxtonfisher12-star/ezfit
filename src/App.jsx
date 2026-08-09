import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { useProfile } from "./hooks/useProfile";

import SignIn from "./pages/SignIn";
import Onboarding from "./pages/onboarding/Onboarding";
import Today from "./pages/Today";
import Train from "./pages/Train";
import TrainDay from "./pages/TrainDay";
import TrainActive from "./pages/TrainActive";
import TrainComplete from "./pages/TrainComplete";
import WorkoutBuilder from "./pages/WorkoutBuilder";
import WorkoutLibrary from "./pages/WorkoutLibrary";
import ExerciseHistory from "./pages/ExerciseHistory";
import SplitBuilder from "./pages/SplitBuilder";
import BlockReview from "./pages/BlockReview";
import CardioLog from "./pages/CardioLog";
import Food from "./pages/Food";
import FoodAdd from "./pages/FoodAdd";
import Progress from "./pages/Progress";
import ProgressPhotos from "./pages/ProgressPhotos";
import Profile from "./pages/Profile";
import CoachHome from "./pages/coach/CoachHome";
import ProgramBuilder from "./pages/coach/ProgramBuilder";
import CoachReview from "./pages/coach/CoachReview";
import CoachHistory from "./pages/coach/CoachHistory";
import GoalSetup from "./pages/coach/GoalSetup";
import ReviewStory from "./pages/coach/ReviewStory";

function Gate({ children }) {
  const { user, loading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();

  if (loading || (user && profileLoading)) {
    return <div className="app"><div className="content">Loading…</div></div>;
  }
  if (!user) return <Navigate to="/sign-in" replace />;
  if (!profile?.onboarded) return <Navigate to="/onboarding" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route path="/sign-in" element={<SignIn />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/today" element={<Gate><Today /></Gate>} />
          <Route path="/train" element={<Gate><Train /></Gate>} />
          <Route path="/train/builder" element={<Gate><WorkoutBuilder /></Gate>} />
          <Route path="/train/library" element={<Gate><WorkoutLibrary /></Gate>} />
          <Route path="/train/exercise/:exerciseId" element={<Gate><ExerciseHistory /></Gate>} />
          <Route path="/train/split" element={<Gate><SplitBuilder /></Gate>} />
          <Route path="/train/block-review" element={<Gate><BlockReview /></Gate>} />
          <Route path="/train/cardio" element={<Gate><CardioLog /></Gate>} />
          <Route path="/train/day/:date" element={<Gate><TrainDay /></Gate>} />
          <Route path="/train/active" element={<Gate><TrainActive /></Gate>} />
          <Route path="/train/complete" element={<Gate><TrainComplete /></Gate>} />
          <Route path="/food" element={<Gate><Food /></Gate>} />
          <Route path="/food/add" element={<Gate><FoodAdd /></Gate>} />
          <Route path="/progress" element={<Gate><Progress /></Gate>} />
          <Route path="/progress/photos" element={<Gate><ProgressPhotos /></Gate>} />
          <Route path="/profile" element={<Gate><Profile /></Gate>} />
          <Route path="/coach" element={<Gate><CoachHome /></Gate>} />
          <Route path="/coach/builder" element={<Gate><ProgramBuilder /></Gate>} />
          <Route path="/coach/review/:id" element={<Gate><CoachReview /></Gate>} />
          <Route path="/coach/history" element={<Gate><CoachHistory /></Gate>} />
          <Route path="/coach/goal" element={<Gate><GoalSetup /></Gate>} />
          <Route path="/coach/story/:id" element={<Gate><ReviewStory /></Gate>} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
