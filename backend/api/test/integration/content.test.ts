import request from 'supertest';
import { createTestApp, loginOwner, type TestApp } from '../helpers/app';
import { newCustomer } from '../helpers/commerce';
import { readMinutes, slugify } from '../../src/content/content.service';

let t: TestApp;
let owner: { auth: string };
beforeAll(async () => {
  t = await createTestApp();
  owner = await loginOwner(t);
});
afterAll(async () => {
  await t.close();
});

const BODY = 'Nội dung bài hướng dẫn đủ dài để qua kiểm tra độ dài tối thiểu của hệ thống.';
const ARTICLE = {
  title: 'Cách bảo quản bột năng đúng cách',
  excerpt: 'Mẹo ngắn giúp bột năng khô ráo và giữ chất lượng lâu hơn.',
  body: BODY,
  category: 'STORAGE',
};

describe('content helpers', () => {
  it('slugifies Vietnamese titles and estimates reading time', () => {
    expect(slugify('Chè Thái thơm béo, đậm vị!')).toBe('che-thai-thom-beo-dam-vi');
    expect(readMinutes('một hai ba')).toBe(1);
    expect(readMinutes(Array(450).fill('từ').join(' '))).toBe(3);
  });
});

describe('articles: editable data with a draft → published lifecycle', () => {
  let id = '';
  let slug = '';

  it('anonymous and customer sessions are rejected by the admin realm', async () => {
    await request(t.server).get('/v1/admin/articles').expect(401);
    const c = await newCustomer(t);
    await request(t.server).get('/v1/admin/articles').set('Authorization', c.auth).expect(401);
    await request(t.server)
      .post('/v1/admin/articles')
      .set('Authorization', c.auth)
      .send(ARTICLE)
      .expect(401);
  });

  it('owner creates a DRAFT with generated slug and reading time; public cannot see it', async () => {
    const res = await request(t.server)
      .post('/v1/admin/articles')
      .set('Authorization', owner.auth)
      .send(ARTICLE)
      .expect(201);
    id = res.body.data.id;
    slug = res.body.data.slug;
    expect(slug).toBe('cach-bao-quan-bot-nang-dung-cach');
    expect(res.body.data.status).toBe('DRAFT');
    expect(res.body.data.readMinutes).toBe(1);
    const list = await request(t.server).get('/v1/articles').expect(200);
    expect(list.body.data.find((a: { id: string }) => a.id === id)).toBeUndefined();
    await request(t.server).get(`/v1/articles/${slug}`).expect(404);
  });

  it('a second article with the same title gets a unique slug', async () => {
    const res = await request(t.server)
      .post('/v1/admin/articles')
      .set('Authorization', owner.auth)
      .send(ARTICLE)
      .expect(201);
    expect(res.body.data.slug).toBe('cach-bao-quan-bot-nang-dung-cach-2');
  });

  it('rejects unsafe cover images and malformed input', async () => {
    await request(t.server)
      .post('/v1/admin/articles')
      .set('Authorization', owner.auth)
      .send({ ...ARTICLE, coverImage: 'javascript:alert(1)' })
      .expect(400);
    await request(t.server)
      .post('/v1/admin/articles')
      .set('Authorization', owner.auth)
      .send({ ...ARTICLE, title: 'x' })
      .expect(400);
  });

  it('publish makes it public (list, category filter, detail) and is audited', async () => {
    await request(t.server)
      .post(`/v1/admin/articles/${id}/publish`)
      .set('Authorization', owner.auth)
      .expect(200);
    const list = await request(t.server).get('/v1/articles?category=STORAGE').expect(200);
    expect(list.body.data.map((a: { id: string }) => a.id)).toContain(id);
    expect(list.body.data[0]).not.toHaveProperty('body');
    const detail = await request(t.server).get(`/v1/articles/${slug}`).expect(200);
    expect(detail.body.data.body).toBe(BODY);
    const other = await request(t.server).get('/v1/articles?category=RECIPE').expect(200);
    expect(other.body.data.map((a: { id: string }) => a.id)).not.toContain(id);
    const audit = await t.prisma.auditLog.findMany({
      where: { entityType: 'article', entityId: id },
    });
    expect(audit.map((a) => a.action).sort()).toEqual(['article.created', 'article.published']);
  });

  it('editing keeps the slug stable once published; featured filter works', async () => {
    await request(t.server)
      .patch(`/v1/admin/articles/${id}`)
      .set('Authorization', owner.auth)
      .send({ slug: 'doi-slug-khac' })
      .expect(400);
    await request(t.server)
      .patch(`/v1/admin/articles/${id}`)
      .set('Authorization', owner.auth)
      .send({ featured: true })
      .expect(200);
    const f = await request(t.server).get('/v1/articles?featured=true').expect(200);
    expect(f.body.data.map((a: { id: string }) => a.id)).toEqual([id]);
  });

  it('a scheduled (future) publish date is not public; archive hides it again', async () => {
    await t.prisma.article.update({
      where: { id },
      data: { publishedAt: new Date(Date.now() + 3_600_000) },
    });
    await request(t.server).get(`/v1/articles/${slug}`).expect(404);
    await t.prisma.article.update({ where: { id }, data: { publishedAt: new Date() } });
    await request(t.server).get(`/v1/articles/${slug}`).expect(200);
    await request(t.server)
      .post(`/v1/admin/articles/${id}/archive`)
      .set('Authorization', owner.auth)
      .expect(200);
    await request(t.server).get(`/v1/articles/${slug}`).expect(404);
  });
});

describe('site info: owner settings, defensive public parsing', () => {
  it('is empty until the owner configures it (no invented contact data)', async () => {
    const res = await request(t.server).get('/v1/site/info').expect(200);
    expect(res.body.data.contact.hotline).toBeNull();
    expect(res.body.data.wholesaleTiers).toEqual([]);
    expect(res.body.data.guideTips).toEqual([]);
  });

  it('owner saves values; malformed tier entries and non-https links are dropped', async () => {
    await request(t.server)
      .put('/v1/admin/site/info')
      .set('Authorization', owner.auth)
      .send({
        contact: {
          hotline: '0900 000 000',
          email: 'cs@example.test',
          social: { facebook: 'https://facebook.com/x', zalo: 'javascript:alert(1)' },
        },
        wholesaleTiers: [
          {
            key: 'a',
            name: 'Cấp A',
            discountPercent: 5,
            minMonthlyVnd: 1_000_000,
            perks: ['Ưu đãi'],
          },
          { key: 'bad', name: 'Sai', discountPercent: 500, minMonthlyVnd: 1 },
        ],
        guideTips: ['Mẹo 1', 42],
      })
      .expect(200);
    const res = await request(t.server).get('/v1/site/info').expect(200);
    expect(res.body.data.contact.hotline).toBe('0900 000 000');
    expect(res.body.data.contact.social.facebook).toBe('https://facebook.com/x');
    expect(res.body.data.contact.social.zalo).toBeNull();
    expect(res.body.data.wholesaleTiers).toHaveLength(1);
    expect(res.body.data.guideTips).toEqual(['Mẹo 1']);
  });

  it('customer session cannot change site info', async () => {
    const c = await newCustomer(t);
    await request(t.server)
      .put('/v1/admin/site/info')
      .set('Authorization', c.auth)
      .send({ guideTips: ['x'] })
      .expect(401);
  });
});

describe('inquiries: public lead forms', () => {
  const quote = {
    kind: 'QUOTE',
    fullName: 'Trần Thị B',
    phone: '0912 345 678',
    businessType: 'MILK_TEA_SHOP',
    province: 'Hồ Chí Minh',
    message: 'Cần báo giá trân châu và bột năng cho quán.',
    consent: true,
  };

  it('stores a quote request with a normalised phone and never needs a session/CSRF', async () => {
    await request(t.server).post('/v1/inquiries').send(quote).expect(202);
    const row = await t.prisma.inquiry.findFirstOrThrow({ where: { kind: 'QUOTE' } });
    expect(row.phone).toBe('0912345678');
    expect(row.status).toBe('NEW');
    expect(row.ipHash).toBeTruthy();
  });

  it('requires consent and a valid phone', async () => {
    await request(t.server)
      .post('/v1/inquiries')
      .send({ ...quote, message: 'Một yêu cầu khác hoàn toàn.', consent: false })
      .expect(400);
    await request(t.server)
      .post('/v1/inquiries')
      .send({ ...quote, phone: '12345', message: 'Một yêu cầu khác nữa nhé.' })
      .expect(400);
  });

  it('suppresses an identical resubmission and silently drops honeypot hits', async () => {
    await request(t.server).post('/v1/inquiries').send(quote).expect(202);
    expect(await t.prisma.inquiry.count({ where: { kind: 'QUOTE' } })).toBe(1);
    await request(t.server)
      .post('/v1/inquiries')
      .send({ ...quote, message: 'Tin nhắn của bot spam gửi hàng loạt.', website: 'http://spam' })
      .expect(202);
    expect(await t.prisma.inquiry.count({ where: { kind: 'QUOTE' } })).toBe(1);
  });

  it('newsletter keeps one row per email and does not reveal duplicates', async () => {
    const body = { kind: 'NEWSLETTER', email: 'Reader@Example.test', consent: true };
    await request(t.server).post('/v1/inquiries').send(body).expect(202);
    await request(t.server).post('/v1/inquiries').send(body).expect(202);
    const rows = await t.prisma.inquiry.findMany({ where: { kind: 'NEWSLETTER' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe('reader@example.test');
  });

  it('staff list contains PII and is realm-gated; status changes are audited', async () => {
    const c = await newCustomer(t);
    await request(t.server).get('/v1/admin/inquiries').set('Authorization', c.auth).expect(401);
    const list = await request(t.server)
      .get('/v1/admin/inquiries?kind=QUOTE')
      .set('Authorization', owner.auth)
      .expect(200);
    expect(list.body.data).toHaveLength(1);
    const id = list.body.data[0].id as string;
    await request(t.server)
      .post(`/v1/admin/inquiries/${id}/status`)
      .set('Authorization', owner.auth)
      .send({ status: 'DONE' })
      .expect(200);
    expect((await t.prisma.inquiry.findUniqueOrThrow({ where: { id } })).status).toBe('DONE');
    expect(
      await t.prisma.auditLog.count({ where: { entityId: id, action: 'inquiry.status' } }),
    ).toBe(1);
  });
});
