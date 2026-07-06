import { supabase } from '@/config/supabase';

export interface PostAuthor {
  id: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
}

export interface FeedPost {
  id: string;
  authorId: string;
  author: PostAuthor;
  tripSource: 'personal' | 'shared';
  tripId: string;
  destination: string;
  startDate: string | null;
  endDate: string | null;
  body: string | null;
  photos: string[];
  createdAt: string;
  likeCount: number;
  iLiked: boolean;
  commentCount: number;
}

export interface PostComment {
  id: string;
  postId: string;
  authorId: string;
  author: PostAuthor;
  body: string;
  createdAt: string;
}

interface CreatePostInput {
  authorId: string;
  tripSource: 'personal' | 'shared';
  tripId: string;
  destination: string;
  startDate?: string | null;
  endDate?: string | null;
  body?: string | null;
  photos: string[];
}

const FEED_SELECT = `
  id, author_id, trip_source, trip_id, destination, start_date, end_date, body, photos, created_at,
  author:profiles!author_id (id, name, username, avatar_url),
  likes:post_likes (user_id),
  comment_count:post_comments (count)
`;

function mapRow(row: any, uid: string | null): FeedPost {
  const likes = (row.likes ?? []) as { user_id: string }[];
  const commentCountRow = (row.comment_count ?? []) as { count: number }[];
  const a = row.author ?? {};
  return {
    id: row.id,
    authorId: row.author_id,
    author: {
      id: a.id ?? row.author_id,
      name: a.name ?? null,
      username: a.username ?? null,
      avatarUrl: a.avatar_url ?? null,
    },
    tripSource: row.trip_source,
    tripId: row.trip_id,
    destination: row.destination,
    startDate: row.start_date,
    endDate: row.end_date,
    body: row.body,
    photos: row.photos ?? [],
    createdAt: row.created_at,
    likeCount: likes.length,
    iLiked: uid ? likes.some((l) => l.user_id === uid) : false,
    commentCount: commentCountRow[0]?.count ?? 0,
  };
}

export async function createTripPost(input: CreatePostInput): Promise<string> {
  const { data, error } = await supabase
    .from('trip_posts')
    .insert({
      author_id: input.authorId,
      trip_source: input.tripSource,
      trip_id: input.tripId,
      destination: input.destination,
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
      body: input.body?.trim() || null,
      photos: input.photos,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function deleteTripPost(postId: string): Promise<void> {
  const { error } = await supabase.from('trip_posts').delete().eq('id', postId);
  if (error) throw error;
}

export async function updateTripPost(
  postId: string,
  updates: { body?: string | null; photos?: string[] },
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if ('body' in updates) payload.body = updates.body?.toString().trim() || null;
  if (updates.photos) payload.photos = updates.photos;
  const { error } = await supabase.from('trip_posts').update(payload).eq('id', postId);
  if (error) throw error;
}

export async function fetchFeed(
  uid: string | null,
  opts: { limit?: number; before?: string } = {},
): Promise<FeedPost[]> {
  let q = supabase
    .from('trip_posts')
    .select(FEED_SELECT)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 30);
  if (opts.before) q = q.lt('created_at', opts.before);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => mapRow(r, uid));
}

export async function fetchPost(postId: string, uid: string | null): Promise<FeedPost | null> {
  const { data, error } = await supabase.from('trip_posts').select(FEED_SELECT).eq('id', postId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapRow(data, uid);
}

export async function fetchTripPosts(
  tripSource: 'personal' | 'shared',
  tripId: string,
  uid: string | null,
): Promise<FeedPost[]> {
  const { data, error } = await supabase
    .from('trip_posts')
    .select(FEED_SELECT)
    .eq('trip_source', tripSource)
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => mapRow(r, uid));
}

export async function setLike(postId: string, uid: string, liked: boolean): Promise<void> {
  if (liked) {
    const { error } = await supabase.from('post_likes').insert({ post_id: postId, user_id: uid });
    if (error && (error as any).code !== '23505') throw error;
  } else {
    const { error } = await supabase
      .from('post_likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', uid);
    if (error) throw error;
  }
}

const COMMENT_SELECT = `id, post_id, author_id, body, created_at, author:profiles!author_id (id, name, username, avatar_url)`;

function mapComment(c: any): PostComment {
  const a = c.author ?? {};
  return {
    id: c.id,
    postId: c.post_id,
    authorId: c.author_id,
    body: c.body,
    createdAt: c.created_at,
    author: {
      id: a.id ?? c.author_id,
      name: a.name ?? null,
      username: a.username ?? null,
      avatarUrl: a.avatar_url ?? null,
    },
  };
}

export async function fetchComments(postId: string): Promise<PostComment[]> {
  const { data, error } = await supabase
    .from('post_comments')
    .select(COMMENT_SELECT)
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapComment);
}

export async function addComment(postId: string, uid: string, body: string): Promise<PostComment> {
  const { data, error } = await supabase
    .from('post_comments')
    .insert({ post_id: postId, author_id: uid, body: body.trim() })
    .select(COMMENT_SELECT)
    .single();
  if (error) throw error;
  return mapComment(data);
}

export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await supabase.from('post_comments').delete().eq('id', commentId);
  if (error) throw error;
}

export async function updateComment(commentId: string, body: string): Promise<void> {
  const { error } = await supabase
    .from('post_comments')
    .update({ body: body.trim() })
    .eq('id', commentId);
  if (error) throw error;
}

// ─── Cloudinary upload ───────────────────────────────────────────────────────

export async function uploadPhotoToCloudinary(localUri: string): Promise<string> {
  const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !uploadPreset) throw new Error('Cloudinary env vars missing');
  const form = new FormData();
  form.append('file', { uri: localUri, type: 'image/jpeg', name: 'photo.jpg' } as any);
  form.append('upload_preset', uploadPreset);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: form,
  });
  const data = await res.json();
  if (!res.ok || !data.secure_url) {
    throw new Error(data.error?.message ?? 'Cloudinary upload failed');
  }
  return data.secure_url as string;
}
