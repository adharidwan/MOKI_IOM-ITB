import { redirect } from "next/navigation";
import {
  FEATURE_DEFINITIONS,
  getCurrentUserFromCookies,
  getGrantedFeaturesForUser,
  isAdminRole,
} from "./lib/access-control";

export default async function HomePage() {
  const user = await getCurrentUserFromCookies();

  if (isAdminRole(user.roles)) {
    redirect("/contacts");
  }

  const features = await getGrantedFeaturesForUser(user);
  const firstFeature = FEATURE_DEFINITIONS.find((f) => features.includes(f.key));

  redirect(firstFeature?.path ?? "/access-denied");
}
