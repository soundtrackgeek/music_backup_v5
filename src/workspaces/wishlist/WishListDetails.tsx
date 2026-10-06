import { Heart, UsersRound, Album, Sparkles, ExternalLink } from "lucide-react";
import type { AppModel } from "../../app/useAppController";
export function WishListDetails({ model }: { model: Pick<AppModel, never> }) {
  const {} = model;
  return (
    <aside
      className="detail-panel wish-list-detail"
      aria-label="Wish List details"
    >
      <div className="detail-header">
        <Heart size={20} />
        <div>
          <h2>Collection watch</h2>
          <p>Automatically reconciled</p>
        </div>
      </div>
      <section className="calculation-list">
        <div>
          <UsersRound size={17} />
          <span>Save artists from Luna discovery</span>
        </div>
        <div>
          <Album size={17} />
          <span>Save missing MusicBrainz albums</span>
        </div>
        <div>
          <Sparkles size={17} />
          <span>Acquired music is removed after import</span>
        </div>
        <div>
          <ExternalLink size={17} />
          <span>MusicBrainz references stay one click away</span>
        </div>
      </section>
    </aside>
  );
}
