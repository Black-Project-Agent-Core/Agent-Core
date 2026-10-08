use crate::ranking_v01::{
    CatalogProductFirstSeenV01, CatalogProductMembershipV01, CatalogProductResultV01,
    CatalogRankingEntityV01, CatalogRankingInputV01, CatalogRankingObservationV01,
    ProductRankingEntityV01, ProductRankingInputV01, ProductRankingObservationV01,
};
use crate::structural_index_v01::{StructuralWireInputV01, StructuralWireSegmentV01};
use std::convert::{TryFrom, TryInto};

const PRODUCT_HEADER_BYTES: usize = 16;
const PRODUCT_ENTITY_BYTES: usize = 32;
const PRODUCT_OBSERVATION_BYTES: usize = 24;

const CATALOG_HEADER_BYTES: usize = 24;
const CATALOG_ENTITY_BYTES: usize = 32;
const CATALOG_OBSERVATION_BYTES: usize = 32;
const CATALOG_MEMBERSHIP_BYTES: usize = 8;
const CATALOG_FIRST_SEEN_BYTES: usize = 8;
const PRODUCT_RESULT_BYTES: usize = 128;

const STRUCTURAL_HEADER_BYTES: usize = 8;
const STRUCTURAL_SEGMENT_BYTES: usize = 24;

#[derive(Debug, Clone, Copy)]
pub struct ProductRankingV01View<'a> {
    payload: &'a [u8],
    product_count: usize,
    observation_count: usize,
    products_start: usize,
    observations_start: usize,
}

impl<'a> ProductRankingV01View<'a> {
    pub fn parse(payload: &'a [u8]) -> Result<Self, &'static str> {
        if payload.len() < PRODUCT_HEADER_BYTES {
            return Err("product ranking v0.1 payload is truncated");
        }

        let product_count = to_usize(read_u32(payload, 0)?)?;
        let observation_count = to_usize(read_u32(payload, 4)?)?;
        let query_count = to_usize(read_u32(payload, 8)?)?;
        let coverage_count = to_usize(read_u32(payload, 12)?)?;

        let product_bytes = checked_mul(product_count, PRODUCT_ENTITY_BYTES)?;
        let observation_bytes = checked_mul(observation_count, PRODUCT_OBSERVATION_BYTES)?;
        let query_bytes = checked_mul(query_count, 4)?;
        let coverage_bytes = checked_mul(coverage_count, 8)?;

        let products_start = PRODUCT_HEADER_BYTES;
        let observations_start = checked_add(products_start, product_bytes)?;
        let queries_start = checked_add(observations_start, observation_bytes)?;
        let query_end = checked_add(queries_start, query_bytes)?;
        let coverage_start = align8(query_end)?;
        let expected_len = checked_add(coverage_start, coverage_bytes)?;

        if payload.len() != expected_len {
            return Err("product ranking v0.1 payload length is invalid");
        }
        require_zero(payload, query_end, coverage_start)?;

        let mut query_cursor = 0usize;
        let mut coverage_cursor = 0usize;

        for index in 0..product_count {
            let off = checked_add(products_start, checked_mul(index, PRODUCT_ENTITY_BYTES)?)?;

            if read_u32(payload, off)? == 0 || read_u32(payload, off + 4)? == 0 {
                return Err("product ranking v0.1 local keys must be non-zero");
            }

            let first_seen = read_u8(payload, off + 8)?;
            if first_seen > 2 {
                return Err("product ranking v0.1 first-seen bucket is invalid");
            }

            let fallback = read_u8(payload, off + 9)?;
            if fallback > 1 {
                return Err("product ranking v0.1 fallback flag is invalid");
            }

            require_zero(payload, off + 10, off + 12)?;
            require_zero(payload, off + 28, off + 32)?;

            let query_start = to_usize(read_u32(payload, off + 12)?)?;
            let query_len = to_usize(read_u32(payload, off + 16)?)?;
            let coverage_index = to_usize(read_u32(payload, off + 20)?)?;
            let coverage_len = to_usize(read_u32(payload, off + 24)?)?;

            if query_start != query_cursor || coverage_index != coverage_cursor {
                return Err("product ranking v0.1 flattened arrays are non-canonical");
            }

            let query_next = checked_add(query_start, query_len)?;
            let coverage_next = checked_add(coverage_index, coverage_len)?;

            if query_next > query_count || coverage_next > coverage_count {
                return Err("product ranking v0.1 flattened array range is invalid");
            }

            for query_index in query_start..query_next {
                let qoff = checked_add(queries_start, checked_mul(query_index, 4)?)?;
                if read_u32(payload, qoff)? == 0 {
                    return Err("product ranking v0.1 query keys must be non-zero");
                }
            }

            for coverage_index in coverage_index..coverage_next {
                let coff = checked_add(coverage_start, checked_mul(coverage_index, 8)?)?;
                require_finite(read_f64(payload, coff)?)?;
            }

            query_cursor = query_next;
            coverage_cursor = coverage_next;
        }

        if query_cursor != query_count || coverage_cursor != coverage_count {
            return Err("product ranking v0.1 flattened arrays are incomplete");
        }

        for index in 0..observation_count {
            let off = checked_add(
                observations_start,
                checked_mul(index, PRODUCT_OBSERVATION_BYTES)?,
            )?;

            if read_u32(payload, off)? == 0 || read_u32(payload, off + 4)? == 0 {
                return Err("product ranking v0.1 observation keys must be non-zero");
            }

            if read_u8(payload, off + 12)? > 2 {
                return Err("product ranking v0.1 observation bucket is invalid");
            }

            require_zero(payload, off + 14, off + 16)?;
            require_finite(read_f64(payload, off + 16)?)?;
        }

        Ok(Self {
            payload,
            product_count,
            observation_count,
            products_start,
            observations_start,
        })
    }

    pub fn len(&self) -> usize {
        self.product_count.saturating_add(self.observation_count)
    }

    pub fn product_count(&self) -> usize {
        self.product_count
    }

    pub fn observation_count(&self) -> usize {
        self.observation_count
    }

    pub fn product_key(&self, index: usize) -> Option<u32> {
        if index >= self.product_count {
            return None;
        }
        let off = self
            .products_start
            .checked_add(index.checked_mul(PRODUCT_ENTITY_BYTES)?)?;
        read_u32(self.payload, off).ok()
    }

    pub fn catalog_key(&self, index: usize) -> Option<u32> {
        if index >= self.product_count {
            return None;
        }
        let off = self
            .products_start
            .checked_add(index.checked_mul(PRODUCT_ENTITY_BYTES)?)?;
        read_u32(self.payload, off + 4).ok()
    }

    pub fn observation_product_key(&self, index: usize) -> Option<u32> {
        if index >= self.observation_count {
            return None;
        }
        let off = self
            .observations_start
            .checked_add(index.checked_mul(PRODUCT_OBSERVATION_BYTES)?)?;
        read_u32(self.payload, off).ok()
    }
}

impl<'a> ProductRankingV01View<'a> {
    pub fn to_owned_input(&self) -> Result<ProductRankingInputV01, &'static str> {
        let query_count = to_usize(read_u32(self.payload, 8)?)?;

        let observation_bytes = checked_mul(self.observation_count, PRODUCT_OBSERVATION_BYTES)?;
        let queries_start = checked_add(self.observations_start, observation_bytes)?;
        let query_bytes = checked_mul(query_count, 4)?;
        let query_end = checked_add(queries_start, query_bytes)?;
        let coverage_start = align8(query_end)?;

        let mut products = Vec::with_capacity(self.product_count);

        for index in 0..self.product_count {
            let off = checked_add(
                self.products_start,
                checked_mul(index, PRODUCT_ENTITY_BYTES)?,
            )?;

            let query_start = to_usize(read_u32(self.payload, off + 12)?)?;
            let query_len = to_usize(read_u32(self.payload, off + 16)?)?;
            let query_next = checked_add(query_start, query_len)?;

            let coverage_index = to_usize(read_u32(self.payload, off + 20)?)?;
            let coverage_len = to_usize(read_u32(self.payload, off + 24)?)?;
            let coverage_next = checked_add(coverage_index, coverage_len)?;

            let mut applicable_query_keys = Vec::with_capacity(query_len);

            for query_index in query_start..query_next {
                let qoff = checked_add(queries_start, checked_mul(query_index, 4)?)?;

                applicable_query_keys.push(read_u32(self.payload, qoff)?);
            }

            let mut session_coverages = Vec::with_capacity(coverage_len);

            for item in coverage_index..coverage_next {
                let coff = checked_add(coverage_start, checked_mul(item, 8)?)?;

                session_coverages.push(read_f64(self.payload, coff)?);
            }

            products.push(ProductRankingEntityV01 {
                product_key: read_u32(self.payload, off)?,
                catalog_key: read_u32(self.payload, off + 4)?,
                first_seen_bucket: read_u8(self.payload, off + 8)?,
                applicable_query_keys,
                session_coverages,
                segmentation_fallback: read_u8(self.payload, off + 9)? != 0,
            });
        }

        let mut observations = Vec::with_capacity(self.observation_count);

        for index in 0..self.observation_count {
            let off = checked_add(
                self.observations_start,
                checked_mul(index, PRODUCT_OBSERVATION_BYTES)?,
            )?;

            observations.push(ProductRankingObservationV01 {
                product_key: read_u32(self.payload, off)?,
                query_key: read_u32(self.payload, off + 4)?,
                position: read_u32(self.payload, off + 8)? as i32,
                window_bucket: read_u8(self.payload, off + 12)?,
                surface_code: read_u8(self.payload, off + 13)?,
                reliability: read_f64(self.payload, off + 16)?,
            });
        }

        Ok(ProductRankingInputV01 {
            products,
            observations,
        })
    }
}

#[derive(Debug, Clone, Copy)]
pub struct CatalogRankingV01View<'a> {
    payload: &'a [u8],
    catalog_count: usize,
    observation_count: usize,
    membership_count: usize,
    first_seen_count: usize,
    product_result_count: usize,
    catalogs_start: usize,
}

impl<'a> CatalogRankingV01View<'a> {
    pub fn parse(payload: &'a [u8]) -> Result<Self, &'static str> {
        if payload.len() < CATALOG_HEADER_BYTES {
            return Err("catalog ranking v0.1 payload is truncated");
        }

        let catalog_count = to_usize(read_u32(payload, 0)?)?;
        let observation_count = to_usize(read_u32(payload, 4)?)?;
        let membership_count = to_usize(read_u32(payload, 8)?)?;
        let first_seen_count = to_usize(read_u32(payload, 12)?)?;
        let product_result_count = to_usize(read_u32(payload, 16)?)?;
        let coverage_count = to_usize(read_u32(payload, 20)?)?;

        let catalog_bytes = checked_mul(catalog_count, CATALOG_ENTITY_BYTES)?;
        let observation_bytes = checked_mul(observation_count, CATALOG_OBSERVATION_BYTES)?;
        let membership_bytes = checked_mul(membership_count, CATALOG_MEMBERSHIP_BYTES)?;
        let first_seen_bytes = checked_mul(first_seen_count, CATALOG_FIRST_SEEN_BYTES)?;
        let product_result_bytes = checked_mul(product_result_count, PRODUCT_RESULT_BYTES)?;
        let coverage_bytes = checked_mul(coverage_count, 8)?;

        let catalogs_start = CATALOG_HEADER_BYTES;
        let observations_start = checked_add(catalogs_start, catalog_bytes)?;
        let memberships_start = checked_add(observations_start, observation_bytes)?;
        let first_seen_start = checked_add(memberships_start, membership_bytes)?;
        let product_results_start = checked_add(first_seen_start, first_seen_bytes)?;
        let coverage_start = checked_add(product_results_start, product_result_bytes)?;
        let expected_len = checked_add(coverage_start, coverage_bytes)?;

        if payload.len() != expected_len {
            return Err("catalog ranking v0.1 payload length is invalid");
        }

        let mut coverage_cursor = 0usize;

        for index in 0..catalog_count {
            let off = checked_add(catalogs_start, checked_mul(index, CATALOG_ENTITY_BYTES)?)?;

            if read_u32(payload, off)? == 0 || read_u32(payload, off + 4)? == 0 {
                return Err("catalog ranking v0.1 local keys must be non-zero");
            }

            let coverage_index = to_usize(read_u32(payload, off + 20)?)?;
            let coverage_len = to_usize(read_u32(payload, off + 24)?)?;

            if coverage_index != coverage_cursor {
                return Err("catalog ranking v0.1 coverage array is non-canonical");
            }

            let coverage_next = checked_add(coverage_index, coverage_len)?;
            if coverage_next > coverage_count {
                return Err("catalog ranking v0.1 coverage range is invalid");
            }

            require_zero(payload, off + 28, off + 32)?;

            for item in coverage_index..coverage_next {
                let coff = checked_add(coverage_start, checked_mul(item, 8)?)?;
                require_finite(read_f64(payload, coff)?)?;
            }

            coverage_cursor = coverage_next;
        }

        if coverage_cursor != coverage_count {
            return Err("catalog ranking v0.1 coverage array is incomplete");
        }

        for index in 0..observation_count {
            let off = checked_add(
                observations_start,
                checked_mul(index, CATALOG_OBSERVATION_BYTES)?,
            )?;

            if read_u32(payload, off)? == 0
                || read_u32(payload, off + 4)? == 0
                || read_u32(payload, off + 12)? == 0
            {
                return Err("catalog ranking v0.1 observation keys must be non-zero");
            }

            if read_u8(payload, off + 16)? > 2 {
                return Err("catalog ranking v0.1 observation bucket is invalid");
            }

            let has_author = read_u8(payload, off + 17)?;
            if has_author > 1 {
                return Err("catalog ranking v0.1 author flag is invalid");
            }
            if has_author == 1 && read_u32(payload, off + 8)? == 0 {
                return Err("catalog ranking v0.1 author key is missing");
            }

            require_zero(payload, off + 18, off + 24)?;
            require_finite(read_f64(payload, off + 24)?)?;
        }

        for index in 0..membership_count {
            let off = checked_add(
                memberships_start,
                checked_mul(index, CATALOG_MEMBERSHIP_BYTES)?,
            )?;
            if read_u32(payload, off)? == 0 || read_u32(payload, off + 4)? == 0 {
                return Err("catalog ranking v0.1 membership keys must be non-zero");
            }
        }

        for index in 0..first_seen_count {
            let off = checked_add(
                first_seen_start,
                checked_mul(index, CATALOG_FIRST_SEEN_BYTES)?,
            )?;
            if read_u32(payload, off)? == 0 {
                return Err("catalog ranking v0.1 first-seen product key must be non-zero");
            }
            if read_u8(payload, off + 4)? > 2 {
                return Err("catalog ranking v0.1 first-seen bucket is invalid");
            }
            require_zero(payload, off + 5, off + 8)?;
        }

        for index in 0..product_result_count {
            let off = checked_add(
                product_results_start,
                checked_mul(index, PRODUCT_RESULT_BYTES)?,
            )?;

            if read_u32(payload, off)? == 0 {
                return Err("catalog ranking v0.1 product-result key must be non-zero");
            }

            let flags = read_u32(payload, off + 24)?;
            if flags & !0b111 != 0 {
                return Err("catalog ranking v0.1 product-result flags are invalid");
            }

            require_zero(payload, off + 29, off + 32)?;

            for value_off in [32usize, 48, 64, 72, 80, 88, 96, 104, 112] {
                require_finite(read_f64(payload, off + value_off)?)?;
            }

            if flags & (1 << 0) != 0 {
                require_finite(read_f64(payload, off + 40)?)?;
            } else if read_u64(payload, off + 40)? != 0 {
                return Err("catalog ranking v0.1 absent previous median must be zero");
            }

            if flags & (1 << 1) != 0 {
                require_finite(read_f64(payload, off + 56)?)?;
            } else if read_u64(payload, off + 56)? != 0 {
                return Err("catalog ranking v0.1 absent rank-velocity score must be zero");
            }
        }

        Ok(Self {
            payload,
            catalog_count,
            observation_count,
            membership_count,
            first_seen_count,
            product_result_count,
            catalogs_start,
        })
    }

    pub fn len(&self) -> usize {
        self.catalog_count
            .saturating_add(self.observation_count)
            .saturating_add(self.membership_count)
            .saturating_add(self.first_seen_count)
            .saturating_add(self.product_result_count)
    }

    pub fn catalog_count(&self) -> usize {
        self.catalog_count
    }

    pub fn catalog_key(&self, index: usize) -> Option<u32> {
        if index >= self.catalog_count {
            return None;
        }
        let off = self
            .catalogs_start
            .checked_add(index.checked_mul(CATALOG_ENTITY_BYTES)?)?;
        read_u32(self.payload, off).ok()
    }
}

impl<'a> CatalogRankingV01View<'a> {
    pub fn to_owned_input(&self) -> Result<CatalogRankingInputV01, &'static str> {
        let catalog_bytes = checked_mul(self.catalog_count, CATALOG_ENTITY_BYTES)?;
        let observations_start = checked_add(self.catalogs_start, catalog_bytes)?;
        let observation_bytes = checked_mul(self.observation_count, CATALOG_OBSERVATION_BYTES)?;
        let memberships_start = checked_add(observations_start, observation_bytes)?;
        let membership_bytes = checked_mul(self.membership_count, CATALOG_MEMBERSHIP_BYTES)?;
        let first_seen_start = checked_add(memberships_start, membership_bytes)?;
        let first_seen_bytes = checked_mul(self.first_seen_count, CATALOG_FIRST_SEEN_BYTES)?;
        let product_results_start = checked_add(first_seen_start, first_seen_bytes)?;
        let product_result_bytes = checked_mul(self.product_result_count, PRODUCT_RESULT_BYTES)?;
        let coverage_start = checked_add(product_results_start, product_result_bytes)?;

        let mut catalogs = Vec::with_capacity(self.catalog_count);
        for index in 0..self.catalog_count {
            let off = checked_add(
                self.catalogs_start,
                checked_mul(index, CATALOG_ENTITY_BYTES)?,
            )?;
            let coverage_index = to_usize(read_u32(self.payload, off + 20)?)?;
            let coverage_len = to_usize(read_u32(self.payload, off + 24)?)?;
            let mut current_session_coverages = Vec::with_capacity(coverage_len);
            for item in coverage_index..checked_add(coverage_index, coverage_len)? {
                let coff = checked_add(coverage_start, checked_mul(item, 8)?)?;
                current_session_coverages.push(read_f64(self.payload, coff)?);
            }
            catalogs.push(CatalogRankingEntityV01 {
                catalog_key: read_u32(self.payload, off)?,
                peer_group_key: read_u32(self.payload, off + 4)?,
                applicable_query_count: read_u32(self.payload, off + 8)?,
                current_completed_queries: read_u32(self.payload, off + 12)?,
                previous_completed_queries: read_u32(self.payload, off + 16)?,
                current_session_coverages,
            });
        }

        let mut observations = Vec::with_capacity(self.observation_count);
        for index in 0..self.observation_count {
            let off = checked_add(
                observations_start,
                checked_mul(index, CATALOG_OBSERVATION_BYTES)?,
            )?;
            observations.push(CatalogRankingObservationV01 {
                catalog_key: read_u32(self.payload, off)?,
                product_key: read_u32(self.payload, off + 4)?,
                author_key: read_u32(self.payload, off + 8)?,
                query_key: read_u32(self.payload, off + 12)?,
                window_bucket: read_u8(self.payload, off + 16)?,
                has_author: read_u8(self.payload, off + 17)? != 0,
                reliability: read_f64(self.payload, off + 24)?,
            });
        }

        let mut memberships = Vec::with_capacity(self.membership_count);
        for index in 0..self.membership_count {
            let off = checked_add(
                memberships_start,
                checked_mul(index, CATALOG_MEMBERSHIP_BYTES)?,
            )?;
            memberships.push(CatalogProductMembershipV01 {
                catalog_key: read_u32(self.payload, off)?,
                product_key: read_u32(self.payload, off + 4)?,
            });
        }

        let mut first_seen = Vec::with_capacity(self.first_seen_count);
        for index in 0..self.first_seen_count {
            let off = checked_add(
                first_seen_start,
                checked_mul(index, CATALOG_FIRST_SEEN_BYTES)?,
            )?;
            first_seen.push(CatalogProductFirstSeenV01 {
                product_key: read_u32(self.payload, off)?,
                first_seen_bucket: read_u8(self.payload, off + 4)?,
            });
        }

        let mut product_results = Vec::with_capacity(self.product_result_count);
        for index in 0..self.product_result_count {
            let off = checked_add(
                product_results_start,
                checked_mul(index, PRODUCT_RESULT_BYTES)?,
            )?;
            let direction_code = read_u8(self.payload, off + 28)?;
            if direction_code > 4 {
                return Err("catalog ranking v0.1 product-result direction is invalid");
            }
            let flags = read_u32(self.payload, off + 24)?;
            product_results.push(CatalogProductResultV01 {
                product_key: read_u32(self.payload, off)?,
                direction_code,
                comparable_history: flags & (1 << 2) != 0,
                rank_velocity: read_f64(self.payload, off + 48)?,
            });
        }

        Ok(CatalogRankingInputV01 {
            catalogs,
            observations,
            memberships,
            first_seen,
            product_results,
        })
    }
}

#[derive(Debug, Clone, Copy)]
pub struct StructuralIndexV01View<'a> {
    payload: &'a [u8],
    segment_count: usize,
}

impl<'a> StructuralIndexV01View<'a> {
    pub fn parse(payload: &'a [u8]) -> Result<Self, &'static str> {
        if payload.len() < STRUCTURAL_HEADER_BYTES {
            return Err("structural index v0.1 payload is truncated");
        }

        let segment_count = to_usize(read_u32(payload, 0)?)?;
        require_zero(payload, 4, 8)?;

        let segment_bytes = checked_mul(segment_count, STRUCTURAL_SEGMENT_BYTES)?;
        let expected_len = checked_add(STRUCTURAL_HEADER_BYTES, segment_bytes)?;

        if payload.len() != expected_len {
            return Err("structural index v0.1 payload length is invalid");
        }

        for index in 0..segment_count {
            let off = checked_add(
                STRUCTURAL_HEADER_BYTES,
                checked_mul(index, STRUCTURAL_SEGMENT_BYTES)?,
            )?;

            if read_u32(payload, off)? == 0 {
                return Err("structural index v0.1 segment key must be non-zero");
            }

            require_zero(payload, off + 14, off + 16)?;
            require_finite(read_f64(payload, off + 16)?)?;
        }

        Ok(Self {
            payload,
            segment_count,
        })
    }

    pub fn len(&self) -> usize {
        self.segment_count
    }

    pub fn segment_count(&self) -> usize {
        self.segment_count
    }

    pub fn segment_key(&self, index: usize) -> Option<u32> {
        if index >= self.segment_count {
            return None;
        }
        let off =
            STRUCTURAL_HEADER_BYTES.checked_add(index.checked_mul(STRUCTURAL_SEGMENT_BYTES)?)?;
        read_u32(self.payload, off).ok()
    }

    pub fn observed_products(&self, index: usize) -> Option<u32> {
        if index >= self.segment_count {
            return None;
        }
        let off =
            STRUCTURAL_HEADER_BYTES.checked_add(index.checked_mul(STRUCTURAL_SEGMENT_BYTES)?)?;
        read_u32(self.payload, off + 8).ok()
    }

    pub fn data_quality_score(&self, index: usize) -> Option<f64> {
        if index >= self.segment_count {
            return None;
        }
        let off =
            STRUCTURAL_HEADER_BYTES.checked_add(index.checked_mul(STRUCTURAL_SEGMENT_BYTES)?)?;
        read_f64(self.payload, off + 16).ok()
    }
}

impl<'a> StructuralIndexV01View<'a> {
    pub fn to_owned_input(&self) -> Result<StructuralWireInputV01, &'static str> {
        let mut segments = Vec::with_capacity(self.segment_count);
        for index in 0..self.segment_count {
            let off = checked_add(
                STRUCTURAL_HEADER_BYTES,
                checked_mul(index, STRUCTURAL_SEGMENT_BYTES)?,
            )?;
            let level_code = read_u8(self.payload, off + 12)?;
            if level_code > 5 {
                return Err("structural index v0.1 level code is invalid");
            }
            let data_quality_grade = read_u8(self.payload, off + 13)?;
            if !(1..=4).contains(&data_quality_grade) {
                return Err("structural index v0.1 data-quality grade is invalid");
            }
            segments.push(StructuralWireSegmentV01 {
                segment_key: read_u32(self.payload, off)?,
                parent_key: read_u32(self.payload, off + 4)?,
                observed_products: read_u32(self.payload, off + 8)?,
                level_code,
                data_quality_grade,
                data_quality_score: read_f64(self.payload, off + 16)?,
            });
        }
        Ok(StructuralWireInputV01 { segments })
    }
}

fn to_usize(value: u32) -> Result<usize, &'static str> {
    usize::try_from(value).map_err(|_| "ranking v0.1 count exceeds platform size")
}

fn checked_add(a: usize, b: usize) -> Result<usize, &'static str> {
    a.checked_add(b)
        .ok_or("ranking v0.1 payload offset overflow")
}

fn checked_mul(a: usize, b: usize) -> Result<usize, &'static str> {
    a.checked_mul(b)
        .ok_or("ranking v0.1 payload length overflow")
}

fn align8(value: usize) -> Result<usize, &'static str> {
    value
        .checked_add(7)
        .map(|value| value & !7)
        .ok_or("ranking v0.1 payload alignment overflow")
}

fn require_zero(payload: &[u8], start: usize, end: usize) -> Result<(), &'static str> {
    let bytes = payload
        .get(start..end)
        .ok_or("ranking v0.1 reserved range is truncated")?;
    if bytes.iter().any(|byte| *byte != 0) {
        return Err("ranking v0.1 reserved bytes must be zero");
    }
    Ok(())
}

fn require_finite(value: f64) -> Result<(), &'static str> {
    if value.is_finite() {
        Ok(())
    } else {
        Err("ranking v0.1 floating-point value must be finite")
    }
}

fn read_u8(payload: &[u8], offset: usize) -> Result<u8, &'static str> {
    payload
        .get(offset)
        .copied()
        .ok_or("ranking v0.1 u8 field is truncated")
}

fn read_u32(payload: &[u8], offset: usize) -> Result<u32, &'static str> {
    let end = offset
        .checked_add(4)
        .ok_or("ranking v0.1 u32 offset overflow")?;
    let raw: [u8; 4] = payload
        .get(offset..end)
        .ok_or("ranking v0.1 u32 field is truncated")?
        .try_into()
        .map_err(|_| "ranking v0.1 u32 field is truncated")?;
    Ok(u32::from_le_bytes(raw))
}

fn read_u64(payload: &[u8], offset: usize) -> Result<u64, &'static str> {
    let end = offset
        .checked_add(8)
        .ok_or("ranking v0.1 u64 offset overflow")?;
    let raw: [u8; 8] = payload
        .get(offset..end)
        .ok_or("ranking v0.1 u64 field is truncated")?
        .try_into()
        .map_err(|_| "ranking v0.1 u64 field is truncated")?;
    Ok(u64::from_le_bytes(raw))
}

fn read_f64(payload: &[u8], offset: usize) -> Result<f64, &'static str> {
    let end = offset
        .checked_add(8)
        .ok_or("ranking v0.1 f64 offset overflow")?;
    let raw: [u8; 8] = payload
        .get(offset..end)
        .ok_or("ranking v0.1 f64 field is truncated")?
        .try_into()
        .map_err(|_| "ranking v0.1 f64 field is truncated")?;
    Ok(f64::from_le_bytes(raw))
}
