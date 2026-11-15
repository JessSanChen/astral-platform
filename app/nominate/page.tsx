import { redirect } from "next/navigation";

/** Where prize entries used to be made. Old links and bookmarks land here. */
export default function Nominate() {
  redirect("/prizes");
}
