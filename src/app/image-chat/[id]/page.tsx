import { ImageChatPage } from "../load";

export const dynamic = "force-dynamic";

export default function Page({ params }: { params: { id: string } }) {
  return <ImageChatPage chatId={params.id} />;
}
