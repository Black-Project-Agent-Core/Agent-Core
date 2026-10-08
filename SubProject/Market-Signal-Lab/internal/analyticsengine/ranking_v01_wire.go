package analyticsengine

import (
	"encoding/binary"
	"errors"
	"math"
)

const (
	productRankingV01EntityBytes      = 32
	productRankingV01ObservationBytes = 24

	catalogRankingV01EntityBytes      = 32
	catalogRankingV01ObservationBytes = 32
	catalogMembershipV01Bytes         = 8
	catalogFirstSeenV01Bytes          = 8
	productRankingV01ResultRowBytes   = 128

	structuralIndexV01SegmentBytes = 24
)

func validRankingBucket(v RankingWindowBucket) bool {
	return v <= RankingWindowPrevious
}

func finiteRankingFloat(v float64) bool {
	return !math.IsNaN(v) && !math.IsInf(v, 0)
}

func EncodeProductRankingV01(in ProductRankingV01Input, dst []byte) ([]byte, error) {
	if uint64(len(in.Products)) > uint64(^uint32(0)) ||
		uint64(len(in.Observations)) > uint64(^uint32(0)) {
		return nil, errors.New("product ranking v0.1 row count exceeds schema limit")
	}

	queryCount := 0
	coverageCount := 0
	for _, row := range in.Products {
		if row.ProductKey == 0 || row.CatalogKey == 0 {
			return nil, errors.New("product ranking v0.1 local keys must be non-zero")
		}
		if !validRankingBucket(row.FirstSeenBucket) {
			return nil, errors.New("product ranking v0.1 first-seen bucket is invalid")
		}
		next, ok := checkedAddInt(queryCount, len(row.ApplicableQueryKeys))
		if !ok || uint64(next) > uint64(^uint32(0)) {
			return nil, errors.New("product ranking v0.1 query-key count exceeds schema limit")
		}
		queryCount = next
		next, ok = checkedAddInt(coverageCount, len(row.SessionCoverages))
		if !ok || uint64(next) > uint64(^uint32(0)) {
			return nil, errors.New("product ranking v0.1 coverage count exceeds schema limit")
		}
		coverageCount = next
		for _, key := range row.ApplicableQueryKeys {
			if key == 0 {
				return nil, errors.New("product ranking v0.1 query keys must be non-zero")
			}
		}
		for _, coverage := range row.SessionCoverages {
			if !finiteRankingFloat(coverage) {
				return nil, errors.New("product ranking v0.1 coverage must be finite")
			}
		}
	}
	for _, row := range in.Observations {
		if row.ProductKey == 0 || row.QueryKey == 0 {
			return nil, errors.New("product ranking v0.1 observation keys must be non-zero")
		}
		if !validRankingBucket(row.WindowBucket) {
			return nil, errors.New("product ranking v0.1 observation bucket is invalid")
		}
		if !finiteRankingFloat(row.Reliability) {
			return nil, errors.New("product ranking v0.1 reliability must be finite")
		}
	}

	productBytes, ok := checkedMulInt(len(in.Products), productRankingV01EntityBytes)
	if !ok {
		return nil, errors.New("product ranking v0.1 entity size overflow")
	}
	observationBytes, ok := checkedMulInt(len(in.Observations), productRankingV01ObservationBytes)
	if !ok {
		return nil, errors.New("product ranking v0.1 observation size overflow")
	}
	queryBytes, ok := checkedMulInt(queryCount, 4)
	if !ok {
		return nil, errors.New("product ranking v0.1 query array size overflow")
	}
	coverageBytes, ok := checkedMulInt(coverageCount, 8)
	if !ok {
		return nil, errors.New("product ranking v0.1 coverage array size overflow")
	}

	productsStart := 16
	observationsStart, ok := checkedAddInt(productsStart, productBytes)
	if !ok {
		return nil, errors.New("product ranking v0.1 payload size overflow")
	}
	queriesStart, ok := checkedAddInt(observationsStart, observationBytes)
	if !ok {
		return nil, errors.New("product ranking v0.1 payload size overflow")
	}
	coverageStartRaw, ok := checkedAddInt(queriesStart, queryBytes)
	if !ok {
		return nil, errors.New("product ranking v0.1 payload size overflow")
	}
	coverageStart, ok := align8Checked(coverageStartRaw)
	if !ok {
		return nil, errors.New("product ranking v0.1 payload alignment overflow")
	}
	total, ok := checkedAddInt(coverageStart, coverageBytes)
	if !ok {
		return nil, errors.New("product ranking v0.1 payload size overflow")
	}

	out := resizeV2Buffer(dst, total)
	binary.LittleEndian.PutUint32(out[0:4], uint32(len(in.Products)))
	binary.LittleEndian.PutUint32(out[4:8], uint32(len(in.Observations)))
	binary.LittleEndian.PutUint32(out[8:12], uint32(queryCount))
	binary.LittleEndian.PutUint32(out[12:16], uint32(coverageCount))

	queryIndex := 0
	coverageIndex := 0
	for i, row := range in.Products {
		off := productsStart + i*productRankingV01EntityBytes
		binary.LittleEndian.PutUint32(out[off:off+4], row.ProductKey)
		binary.LittleEndian.PutUint32(out[off+4:off+8], row.CatalogKey)
		out[off+8] = byte(row.FirstSeenBucket)
		if row.SegmentationFallback {
			out[off+9] = 1
		}
		binary.LittleEndian.PutUint32(out[off+12:off+16], uint32(queryIndex))
		binary.LittleEndian.PutUint32(out[off+16:off+20], uint32(len(row.ApplicableQueryKeys)))
		binary.LittleEndian.PutUint32(out[off+20:off+24], uint32(coverageIndex))
		binary.LittleEndian.PutUint32(out[off+24:off+28], uint32(len(row.SessionCoverages)))

		for _, key := range row.ApplicableQueryKeys {
			qoff := queriesStart + queryIndex*4
			binary.LittleEndian.PutUint32(out[qoff:qoff+4], key)
			queryIndex++
		}
		for _, coverage := range row.SessionCoverages {
			coff := coverageStart + coverageIndex*8
			binary.LittleEndian.PutUint64(out[coff:coff+8], math.Float64bits(coverage))
			coverageIndex++
		}
	}

	for i, row := range in.Observations {
		off := observationsStart + i*productRankingV01ObservationBytes
		binary.LittleEndian.PutUint32(out[off:off+4], row.ProductKey)
		binary.LittleEndian.PutUint32(out[off+4:off+8], row.QueryKey)
		binary.LittleEndian.PutUint32(out[off+8:off+12], uint32(row.Position))
		out[off+12] = byte(row.WindowBucket)
		out[off+13] = row.SurfaceCode
		binary.LittleEndian.PutUint64(out[off+16:off+24], math.Float64bits(row.Reliability))
	}

	return out, nil
}

func EncodeCatalogRankingV01(in CatalogRankingV01Input, dst []byte) ([]byte, error) {
	counts := []int{
		len(in.Catalogs),
		len(in.Observations),
		len(in.Memberships),
		len(in.FirstSeen),
		len(in.ProductResults),
	}
	for _, count := range counts {
		if uint64(count) > uint64(^uint32(0)) {
			return nil, errors.New("catalog ranking v0.1 row count exceeds schema limit")
		}
	}

	coverageCount := 0
	for _, row := range in.Catalogs {
		if row.CatalogKey == 0 || row.PeerGroupKey == 0 {
			return nil, errors.New("catalog ranking v0.1 local keys must be non-zero")
		}
		next, ok := checkedAddInt(coverageCount, len(row.CurrentSessionCoverages))
		if !ok || uint64(next) > uint64(^uint32(0)) {
			return nil, errors.New("catalog ranking v0.1 coverage count exceeds schema limit")
		}
		coverageCount = next
		for _, coverage := range row.CurrentSessionCoverages {
			if !finiteRankingFloat(coverage) {
				return nil, errors.New("catalog ranking v0.1 coverage must be finite")
			}
		}
	}
	for _, row := range in.Observations {
		if row.CatalogKey == 0 || row.ProductKey == 0 || row.QueryKey == 0 {
			return nil, errors.New("catalog ranking v0.1 observation keys must be non-zero")
		}
		if row.HasAuthor && row.AuthorKey == 0 {
			return nil, errors.New("catalog ranking v0.1 author key must be non-zero when present")
		}
		if !validRankingBucket(row.WindowBucket) {
			return nil, errors.New("catalog ranking v0.1 observation bucket is invalid")
		}
		if !finiteRankingFloat(row.Reliability) {
			return nil, errors.New("catalog ranking v0.1 reliability must be finite")
		}
	}
	for _, row := range in.Memberships {
		if row.CatalogKey == 0 || row.ProductKey == 0 {
			return nil, errors.New("catalog ranking v0.1 membership keys must be non-zero")
		}
	}
	for _, row := range in.FirstSeen {
		if row.ProductKey == 0 || !validRankingBucket(row.FirstSeenBucket) {
			return nil, errors.New("catalog ranking v0.1 first-seen row is invalid")
		}
	}

	catalogBytes, ok := checkedMulInt(len(in.Catalogs), catalogRankingV01EntityBytes)
	if !ok {
		return nil, errors.New("catalog ranking v0.1 entity size overflow")
	}
	observationBytes, ok := checkedMulInt(len(in.Observations), catalogRankingV01ObservationBytes)
	if !ok {
		return nil, errors.New("catalog ranking v0.1 observation size overflow")
	}
	membershipBytes, ok := checkedMulInt(len(in.Memberships), catalogMembershipV01Bytes)
	if !ok {
		return nil, errors.New("catalog ranking v0.1 membership size overflow")
	}
	firstSeenBytes, ok := checkedMulInt(len(in.FirstSeen), catalogFirstSeenV01Bytes)
	if !ok {
		return nil, errors.New("catalog ranking v0.1 first-seen size overflow")
	}
	productResultBytes, ok := checkedMulInt(len(in.ProductResults), productRankingV01ResultRowBytes)
	if !ok {
		return nil, errors.New("catalog ranking v0.1 product-result size overflow")
	}
	coverageBytes, ok := checkedMulInt(coverageCount, 8)
	if !ok {
		return nil, errors.New("catalog ranking v0.1 coverage size overflow")
	}

	catalogsStart := 24
	observationsStart, _ := checkedAddInt(catalogsStart, catalogBytes)
	membershipsStart, _ := checkedAddInt(observationsStart, observationBytes)
	firstSeenStart, _ := checkedAddInt(membershipsStart, membershipBytes)
	productResultsStart, _ := checkedAddInt(firstSeenStart, firstSeenBytes)
	coverageStart, _ := checkedAddInt(productResultsStart, productResultBytes)
	total, ok := checkedAddInt(coverageStart, coverageBytes)
	if !ok {
		return nil, errors.New("catalog ranking v0.1 payload size overflow")
	}

	out := resizeV2Buffer(dst, total)
	binary.LittleEndian.PutUint32(out[0:4], uint32(len(in.Catalogs)))
	binary.LittleEndian.PutUint32(out[4:8], uint32(len(in.Observations)))
	binary.LittleEndian.PutUint32(out[8:12], uint32(len(in.Memberships)))
	binary.LittleEndian.PutUint32(out[12:16], uint32(len(in.FirstSeen)))
	binary.LittleEndian.PutUint32(out[16:20], uint32(len(in.ProductResults)))
	binary.LittleEndian.PutUint32(out[20:24], uint32(coverageCount))

	coverageIndex := 0
	for i, row := range in.Catalogs {
		off := catalogsStart + i*catalogRankingV01EntityBytes
		binary.LittleEndian.PutUint32(out[off:off+4], row.CatalogKey)
		binary.LittleEndian.PutUint32(out[off+4:off+8], row.PeerGroupKey)
		binary.LittleEndian.PutUint32(out[off+8:off+12], row.ApplicableQueryCount)
		binary.LittleEndian.PutUint32(out[off+12:off+16], row.CurrentCompletedQueries)
		binary.LittleEndian.PutUint32(out[off+16:off+20], row.PreviousCompletedQueries)
		binary.LittleEndian.PutUint32(out[off+20:off+24], uint32(coverageIndex))
		binary.LittleEndian.PutUint32(out[off+24:off+28], uint32(len(row.CurrentSessionCoverages)))
		for _, coverage := range row.CurrentSessionCoverages {
			coff := coverageStart + coverageIndex*8
			binary.LittleEndian.PutUint64(out[coff:coff+8], math.Float64bits(coverage))
			coverageIndex++
		}
	}

	for i, row := range in.Observations {
		off := observationsStart + i*catalogRankingV01ObservationBytes
		binary.LittleEndian.PutUint32(out[off:off+4], row.CatalogKey)
		binary.LittleEndian.PutUint32(out[off+4:off+8], row.ProductKey)
		binary.LittleEndian.PutUint32(out[off+8:off+12], row.AuthorKey)
		binary.LittleEndian.PutUint32(out[off+12:off+16], row.QueryKey)
		out[off+16] = byte(row.WindowBucket)
		if row.HasAuthor {
			out[off+17] = 1
		}
		binary.LittleEndian.PutUint64(out[off+24:off+32], math.Float64bits(row.Reliability))
	}

	for i, row := range in.Memberships {
		off := membershipsStart + i*catalogMembershipV01Bytes
		binary.LittleEndian.PutUint32(out[off:off+4], row.CatalogKey)
		binary.LittleEndian.PutUint32(out[off+4:off+8], row.ProductKey)
	}

	for i, row := range in.FirstSeen {
		off := firstSeenStart + i*catalogFirstSeenV01Bytes
		binary.LittleEndian.PutUint32(out[off:off+4], row.ProductKey)
		out[off+4] = byte(row.FirstSeenBucket)
	}

	for i, row := range in.ProductResults {
		if row.ProductKey == 0 {
			return nil, errors.New("catalog ranking v0.1 product-result key must be non-zero")
		}
		values := []float64{
			row.MedianPosition,
			row.RankVelocity,
			row.ExposureScore,
			row.FreshnessScore,
			row.CrossQueryStrength,
			row.RelativeStrength,
			row.Confidence,
			row.Coverage,
			row.OpportunityScore,
		}
		for _, value := range values {
			if !finiteRankingFloat(value) {
				return nil, errors.New("catalog ranking v0.1 product-result value must be finite")
			}
		}
		if row.PreviousMedianPosition != nil && !finiteRankingFloat(*row.PreviousMedianPosition) {
			return nil, errors.New("catalog ranking v0.1 previous median must be finite")
		}
		if row.RankVelocityScore != nil && !finiteRankingFloat(*row.RankVelocityScore) {
			return nil, errors.New("catalog ranking v0.1 rank-velocity score must be finite")
		}

		off := productResultsStart + i*productRankingV01ResultRowBytes
		binary.LittleEndian.PutUint32(out[off:off+4], row.ProductKey)
		binary.LittleEndian.PutUint32(out[off+4:off+8], row.CurrentObservationCount)
		binary.LittleEndian.PutUint32(out[off+8:off+12], row.PreviousObservationCount)
		binary.LittleEndian.PutUint32(out[off+12:off+16], row.QueryAppearances)
		binary.LittleEndian.PutUint32(out[off+16:off+20], row.ApplicableQueries)
		binary.LittleEndian.PutUint32(out[off+20:off+24], row.SurfaceAppearances)

		var flags uint32
		if row.PreviousMedianPosition != nil {
			flags |= 1 << 0
		}
		if row.RankVelocityScore != nil {
			flags |= 1 << 1
		}
		if row.ComparableHistory {
			flags |= 1 << 2
		}
		binary.LittleEndian.PutUint32(out[off+24:off+28], flags)
		out[off+28] = row.DirectionCode

		binary.LittleEndian.PutUint64(out[off+32:off+40], math.Float64bits(row.MedianPosition))
		if row.PreviousMedianPosition != nil {
			binary.LittleEndian.PutUint64(out[off+40:off+48], math.Float64bits(*row.PreviousMedianPosition))
		}
		binary.LittleEndian.PutUint64(out[off+48:off+56], math.Float64bits(row.RankVelocity))
		if row.RankVelocityScore != nil {
			binary.LittleEndian.PutUint64(out[off+56:off+64], math.Float64bits(*row.RankVelocityScore))
		}
		binary.LittleEndian.PutUint64(out[off+64:off+72], math.Float64bits(row.ExposureScore))
		binary.LittleEndian.PutUint64(out[off+72:off+80], math.Float64bits(row.FreshnessScore))
		binary.LittleEndian.PutUint64(out[off+80:off+88], math.Float64bits(row.CrossQueryStrength))
		binary.LittleEndian.PutUint64(out[off+88:off+96], math.Float64bits(row.RelativeStrength))
		binary.LittleEndian.PutUint64(out[off+96:off+104], math.Float64bits(row.Confidence))
		binary.LittleEndian.PutUint64(out[off+104:off+112], math.Float64bits(row.Coverage))
		binary.LittleEndian.PutUint64(out[off+112:off+120], math.Float64bits(row.OpportunityScore))
		binary.LittleEndian.PutUint64(out[off+120:off+128], row.MissingMask)
	}

	return out, nil
}

func EncodeStructuralIndexV01(in StructuralIndexV01Input, dst []byte) ([]byte, error) {
	if uint64(len(in.Segments)) > uint64(^uint32(0)) {
		return nil, errors.New("structural index v0.1 row count exceeds schema limit")
	}
	rowsBytes, ok := checkedMulInt(len(in.Segments), structuralIndexV01SegmentBytes)
	if !ok {
		return nil, errors.New("structural index v0.1 row size overflow")
	}
	total, ok := checkedAddInt(8, rowsBytes)
	if !ok {
		return nil, errors.New("structural index v0.1 payload size overflow")
	}

	out := resizeV2Buffer(dst, total)
	binary.LittleEndian.PutUint32(out[0:4], uint32(len(in.Segments)))

	for i, row := range in.Segments {
		if row.SegmentKey == 0 {
			return nil, errors.New("structural index v0.1 segment key must be non-zero")
		}
		if !finiteRankingFloat(row.DataQualityScore) {
			return nil, errors.New("structural index v0.1 data-quality score must be finite")
		}

		off := 8 + i*structuralIndexV01SegmentBytes
		binary.LittleEndian.PutUint32(out[off:off+4], row.SegmentKey)
		binary.LittleEndian.PutUint32(out[off+4:off+8], row.ParentKey)
		binary.LittleEndian.PutUint32(out[off+8:off+12], row.ObservedProducts)
		out[off+12] = row.LevelCode
		out[off+13] = row.DataQualityGrade
		binary.LittleEndian.PutUint64(
			out[off+16:off+24],
			math.Float64bits(row.DataQualityScore),
		)
	}

	return out, nil
}
