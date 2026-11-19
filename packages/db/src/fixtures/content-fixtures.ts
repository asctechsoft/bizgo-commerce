/**
 * DEV ONLY (ADR-0013/0014): sample guide articles and owner-managed site info so the "Cẩm nang", "Mua sỉ B2B"
 * and "Liên hệ" pages can be clicked through locally. Nothing here is a real commitment: the contact details and
 * wholesale tiers are PLACEHOLDERS copied from the design mock-up and must be replaced by the owner through
 * `PUT /v1/admin/site/info` before any production launch. Never part of the real seed.
 */
import type { PrismaClient } from '@prisma/client';
import { assertFixturesAllowed } from './test-fixtures';

type Category = 'RECIPE' | 'INGREDIENT' | 'BUSINESS' | 'STORAGE' | 'WHOLESALE';

interface SampleArticle {
  slug: string;
  title: string;
  excerpt: string;
  category: Category;
  coverImage: string | null;
  featured: boolean;
  daysAgo: number;
  body: string;
}

const SAMPLE_ARTICLES: SampleArticle[] = [
  {
    slug: 'cach-nau-che-thai-thom-beo',
    title: 'Cách nấu chè Thái thơm béo, chuẩn vị quán với nguyên liệu dễ tìm',
    excerpt:
      'Hướng dẫn nấu chè Thái với vị béo ngậy, mát lạnh, nguyên liệu đơn giản và mẹo để chè không bị tách nước.',
    category: 'RECIPE',
    coverImage: '/blog/post_thai_dessert.png',
    featured: true,
    daysAgo: 7,
    body: `Chè Thái ngon nhờ ba yếu tố: nước cốt dừa béo vừa đủ, topping giòn dai và đá lạnh đúng lúc. Bài viết này gợi ý quy trình nấu gọn để bạn làm được số lượng lớn mà vẫn giữ vị ổn định.

## Chuẩn bị nguyên liệu
- Nước cốt dừa và sữa tươi (hoặc sữa đặc) để tạo vị béo
- Trân châu trắng, thạch rau câu hoặc thạch dừa
- Trái cây tươi như xoài, mít, sầu riêng tùy sở thích
- Lá dứa để tăng mùi thơm

## Các bước thực hiện
Nấu trân châu và thạch riêng, ngâm nước lạnh để giữ độ dai. Đun nhỏ lửa nước cốt dừa với một chút muối, không để sôi mạnh vì dễ bị tách nước. Khi nguội, trộn sữa vào, nêm vị ngọt vừa phải.

## Mẹo giữ chè không tách nước
Khuấy đều tay khi đun, tắt bếp sớm và để nguội từ từ. Chỉ cho đá và topping vào ly ngay trước khi bán.`,
  },
  {
    slug: 'cac-loai-tran-chau-pho-bien',
    title: 'Các loại trân châu phổ biến và cách chọn phù hợp cho từng món chè',
    excerpt:
      'Tìm hiểu đặc điểm, ưu nhược điểm của từng loại trân châu và gợi ý cách lựa chọn phù hợp.',
    category: 'INGREDIENT',
    coverImage: '/blog/post_tapioca_pearls.png',
    featured: true,
    daysAgo: 9,
    body: `Trân châu là topping quen thuộc của trà sữa và chè. Mỗi loại có độ dai, thời gian nấu và cách bảo quản khác nhau, nên chọn đúng loại sẽ giúp món ăn ngon và dễ vận hành hơn.

## Trân châu đen
Màu đậm, vị ngọt nhẹ, hợp trà sữa và các món có sữa. Nên nấu theo hướng dẫn trên bao bì và ngâm trong nước đường để giữ độ dai.

## Trân châu trắng
Trong, dai mềm, hợp chè và đồ uống thanh mát. Dễ nhạt vị nên cần ngâm đường hoặc siro.

## Cách chọn
Xác định món bán chính, thời gian chuẩn bị mỗi ngày và cách bảo quản của quán, sau đó thử mẻ nhỏ trước khi nhập số lượng lớn.`,
  },
  {
    slug: 'mo-quan-che-nho-chi-phi-va-kinh-nghiem',
    title: 'Mở quán chè nhỏ: Chi phí, nguyên liệu và kinh nghiệm vận hành hiệu quả',
    excerpt:
      'Tổng hợp các hạng mục cần chuẩn bị và lưu ý quan trọng để vận hành quán chè nhỏ thuận lợi.',
    category: 'BUSINESS',
    coverImage: null,
    featured: true,
    daysAgo: 14,
    body: `Quán chè nhỏ cần ít vốn hơn nhiều mô hình khác nhưng vẫn đòi hỏi tính toán kỹ về nguyên liệu và quy trình. Dưới đây là danh sách để bạn tự rà soát.

## Các hạng mục cần chuẩn bị
- Mặt bằng và thiết bị làm lạnh, bếp nấu, dụng cụ đong
- Danh sách nguyên liệu khô và nguyên liệu cần giữ lạnh
- Quy trình nấu theo mẻ và định lượng cho mỗi phần bán
- Cách ghi chép nhập hàng, tồn kho và hao hụt hằng ngày

## Lưu ý vận hành
Bắt đầu với thực đơn gọn, theo dõi món bán chạy rồi mới mở rộng. Làm việc với nhà cung cấp ổn định để giá vốn không biến động quá nhiều.`,
  },
  {
    slug: 'cach-bao-quan-dau-xanh-dau-do',
    title: 'Cách bảo quản đậu xanh, đậu đỏ để luôn thơm ngon, không bị mốc',
    excerpt: 'Mẹo bảo quản đúng cách giúp đậu giữ được độ ngon, màu đẹp và sử dụng được lâu hơn.',
    category: 'STORAGE',
    coverImage: '/blog/post_mung_beans.png',
    featured: false,
    daysAgo: 11,
    body: `Đậu khô hút ẩm rất nhanh nên dễ bị mốc hoặc mọt nếu để sai chỗ. Một vài thói quen nhỏ giúp đậu giữ chất lượng lâu hơn.

## Nguyên tắc chung
- Để nơi khô ráo, thoáng mát, tránh ánh nắng trực tiếp
- Dùng hộp hoặc túi kín sau khi mở bao, ghi rõ ngày mở
- Không để lẫn với nguyên liệu có mùi mạnh hoặc ẩm

## Kiểm tra trước khi dùng
Nếu thấy hạt có mùi lạ, đổi màu hoặc có mọt thì không sử dụng. Hạn sử dụng và điều kiện bảo quản in trên bao bì của nhà sản xuất luôn là căn cứ chính.`,
  },
  {
    slug: 'cach-lam-thach-cu-nang-gion-ngon',
    title: 'Cách làm thạch củ năng giòn ngon, tăng độ hấp dẫn cho món chè',
    excerpt:
      'Công thức chi tiết để làm thạch củ năng giòn dai, trong veo, kết hợp ngon với nhiều loại chè.',
    category: 'RECIPE',
    coverImage: '/blog/post_jelly_cubes.png',
    featured: false,
    daysAgo: 16,
    body: `Thạch củ năng giòn dai, trong veo và dễ kết hợp với chè, trà trái cây hay sữa chua. Quy trình làm không phức tạp nhưng cần chú ý độ đông.

## Nguyên liệu
- Củ năng thái hạt lựu
- Bột làm thạch và nước
- Chút nước cốt hoặc màu tự nhiên nếu muốn thạch có màu

## Cách làm
Hòa bột với nước theo tỉ lệ trên bao bì, đun nhỏ lửa đến khi tan hoàn toàn. Cho củ năng vào, đổ khuôn và để nguội rồi cho vào ngăn mát. Cắt miếng vừa ăn trước khi dùng.`,
  },
  {
    slug: 'bot-bang-bot-nang-bot-san-khac-nhau',
    title: 'Bột báng, bột năng, bột sắn: Khác nhau như thế nào và dùng ra sao?',
    excerpt:
      'Phân biệt đặc điểm, công dụng và cách sử dụng hiệu quả của 3 loại bột phổ biến khi nấu chè.',
    category: 'INGREDIENT',
    coverImage: null,
    featured: false,
    daysAgo: 18,
    body: `Ba loại bột này đều làm từ tinh bột nhưng cho độ dẻo, độ trong và độ dai khác nhau, vì vậy không thể thay thế cho nhau một cách tùy ý.

## Bột năng
Thường dùng để làm bánh dẻo, trân châu và tạo độ sánh cho nước chè.

## Bột báng
Hạt tròn, nấu chín trở nên trong và mềm, hợp các món chè nước cốt dừa.

## Bột sắn
Tạo độ sánh mịn và độ trong tốt cho nước sốt hoặc chè đặc.

Luôn đọc thành phần và hướng dẫn của từng nhà sản xuất, và thử mẻ nhỏ trước khi áp dụng cho số lượng lớn.`,
  },
  {
    slug: 'che-duong-nhan-thanh-mat',
    title: 'Cách nấu chè dưỡng nhan thanh mát, bổ dưỡng tại nhà',
    excerpt: 'Công thức chè dưỡng nhan đơn giản, giàu dinh dưỡng, giúp thanh nhiệt và làm đẹp da.',
    category: 'RECIPE',
    coverImage: '/blog/post_tremella_dessert.png',
    featured: false,
    daysAgo: 21,
    body: `Chè dưỡng nhan là món ngọt nhẹ với tuyết yến hoặc ngân nhĩ, táo đỏ, hạt sen và kỷ tử. Món này thường được dùng lạnh hoặc ấm tùy khẩu vị.

## Nguyên liệu
- Ngân nhĩ hoặc tuyết yến ngâm nở
- Táo đỏ, hạt sen, kỷ tử
- Đường phèn

## Cách nấu
Ninh hạt sen và táo đỏ với lửa nhỏ cho mềm, thêm ngân nhĩ vào sau, nêm đường phèn vừa ăn và cho kỷ tử cuối cùng để giữ màu.`,
  },
  {
    slug: 'che-nhieu-tang-cho-quan',
    title: 'Chè nhiều tầng: Cách sắp xếp topping để ly chè đẹp và dễ bán',
    excerpt:
      'Gợi ý thứ tự xếp lớp topping, nước cốt và đá để ly chè nhìn bắt mắt mà vẫn dễ vận hành.',
    category: 'BUSINESS',
    coverImage: '/blog/post_layered_dessert.png',
    featured: false,
    daysAgo: 25,
    body: `Một ly chè nhiều tầng đẹp mắt giúp món ăn dễ được chụp ảnh và chia sẻ. Chìa khóa là thứ tự xếp lớp và độ đặc của từng lớp.

## Thứ tự gợi ý
- Lớp nặng và đặc ở dưới như khoai, đậu
- Lớp thạch, trân châu ở giữa
- Nước cốt dừa hoặc sữa rót nhẹ theo thành ly
- Topping nhẹ và trái cây tươi ở trên cùng

Chuẩn bị sẵn từng lớp theo định lượng cố định giúp nhân viên làm nhanh và ly nào cũng đồng đều.`,
  },
];

const SAMPLE_SITE_INFO = {
  contact: {
    hotline: '0909 123 456',
    email: 'lienhe@bizgo.vn',
    hours: 'Thứ 2 – Thứ 7: 08:00 – 17:30 (Nghỉ Chủ nhật và ngày lễ)',
    address: 'Số 123 Đường Tân Phú, P. Tân Quý, Q. Tân Phú, TP. HCM',
    addressNote: 'Kho hàng & điểm nhận / giao hàng',
    social: { facebook: null, zalo: null, youtube: null, tiktok: null },
  },
  wholesaleTiers: [
    {
      key: 'basic',
      name: 'Đại lý cơ bản',
      audience: 'Dành cho quán nhỏ, mới kinh doanh',
      discountPercent: 5,
      minMonthlyVnd: 1_000_000,
      perks: ['Giá sỉ ưu đãi', 'Hỗ trợ tư vấn sản phẩm'],
      popular: false,
    },
    {
      key: 'potential',
      name: 'Đại lý tiềm năng',
      audience: 'Dành cho quán, cửa hàng ổn định',
      discountPercent: 10,
      minMonthlyVnd: 5_000_000,
      perks: ['Giá sỉ tốt hơn', 'Ưu tiên giữ hàng', 'Hỗ trợ marketing cơ bản'],
      popular: true,
    },
    {
      key: 'strategic',
      name: 'Đại lý chiến lược',
      audience: 'Dành cho đối tác, chuỗi cửa hàng',
      discountPercent: 15,
      minMonthlyVnd: 10_000_000,
      perks: ['Giá sỉ tốt nhất', 'Ưu tiên nguồn hàng lớn', 'Hỗ trợ vận chuyển & chính sách riêng'],
      popular: false,
    },
  ],
  guideTips: [
    'Ngâm bột báng 15–20 phút trước khi nấu để hạt trong và dẻo hơn.',
    'Thêm một chút muối khi nấu đậu để đậu nhanh mềm và đậm vị.',
    'Bảo quản topping trong hộp kín, để ngăn mát và dùng trong 2–3 ngày.',
    'Luôn cân đối độ ngọt để chè thanh, không bị gắt.',
  ],
};

export async function loadContentFixtures(
  prisma: PrismaClient,
): Promise<{ articles: number; siteInfo: boolean }> {
  assertFixturesAllowed();
  const day = 86_400_000;
  let articles = 0;
  for (const a of SAMPLE_ARTICLES) {
    const words = a.body.trim().split(/\s+/).length;
    const data = {
      title: a.title,
      excerpt: a.excerpt,
      body: a.body,
      category: a.category,
      coverImage: a.coverImage,
      featured: a.featured,
      readMinutes: Math.max(1, Math.ceil(words / 200)),
    };
    const hit = await prisma.article.findUnique({ where: { slug: a.slug } });
    if (!hit) {
      await prisma.article.create({
        data: {
          slug: a.slug,
          ...data,
          status: 'PUBLISHED',
          publishedAt: new Date(Date.now() - a.daysAgo * day),
        },
      });
      articles++;
    }
  }
  // Only set site info when the owner has not configured it yet (never overwrite real settings).
  const keys = ['site.contact', 'site.wholesale_tiers', 'site.guide_tips'];
  const existing = new Set(
    (await prisma.setting.findMany({ where: { key: { in: keys } } })).map((s) => s.key),
  );
  const values: Record<string, unknown> = {
    'site.contact': SAMPLE_SITE_INFO.contact,
    'site.wholesale_tiers': SAMPLE_SITE_INFO.wholesaleTiers,
    'site.guide_tips': SAMPLE_SITE_INFO.guideTips,
  };
  let wrote = false;
  for (const key of keys) {
    if (existing.has(key)) continue;
    await prisma.setting.create({ data: { key, value: values[key] as never } });
    wrote = true;
  }
  return { articles, siteInfo: wrote };
}
